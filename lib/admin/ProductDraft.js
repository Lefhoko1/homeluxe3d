/**
 * Creating a product is a five-table write. This is the object that owns it.
 *
 *     products              the listing
 *     product_variants      the .glb, and how to anchor it
 *     product_media         the photographs
 *     product_room_types    where it may be placed
 *     storage               the files themselves
 *
 * Done as five calls from a form component, a failure half way leaves a
 * product with no model, or files in a bucket with no row pointing at them.
 * Gathering it here means the ORDER and the FAILURE BEHAVIOUR are decided
 * once, in a file whose whole job is to know them:
 *
 *   1. The product row goes in FIRST, as a draft. It is the id everything
 *      else hangs off, and a draft is invisible to v_live_placements -- so a
 *      half-finished upload can never reach a visitor.
 *   2. Files upload next. A failure here leaves the draft behind to be
 *      retried or deleted, which is recoverable; the reverse is not.
 *   3. The variant row goes in LAST, because a variant is what makes the
 *      product placeable, and it must not exist before the file it points at.
 *   4. Only then is the requested status applied.
 *
 * Postgres has no transaction across HTTP calls, so this is the next best
 * thing: an order in which every intermediate state is a state the rest of
 * the app already handles.
 */

import { getSupabase } from "../supabase/client";
import { AssetStore } from "../storage/AssetStore";

export class ValidationError extends Error {
  constructor(problems) {
    super(problems.join(" "));
    this.name = "ValidationError";
    this.problems = problems;
  }
}

export class ProductDraft {
  constructor(fields = {}) {
    this.shopId = fields.shopId ?? null;
    this.shopSlug = fields.shopSlug ?? null;
    this.name = fields.name ?? "";
    this.slug = fields.slug ?? "";
    this.sku = fields.sku ?? "";
    this.description = fields.description ?? "";
    this.categoryCode = fields.categoryCode ?? "";
    this.currency = fields.currency ?? "BWP";
    this.price = fields.price ?? "";           // as typed, in pula
    this.roomTypes = fields.roomTypes ?? [];
    this.dimensions = fields.dimensions ?? { width: "", depth: "", height: "" };
    this.status = fields.status ?? "published";

    /** @type {import('./ModelInspector').ModelInspection|null} */
    this.inspection = fields.inspection ?? null;
    /** @type {File[]} first image becomes the thumbnail */
    this.images = fields.images ?? [];
  }

  /** The database stores cents; people type pula. */
  get priceCents() {
    const value = Number(String(this.price).replace(/[^0-9.]/g, ""));
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
  }

  get modelFile() {
    return this.inspection?.file ?? null;
  }

  /**
   * Everything wrong with this draft, in the order a person would fix it.
   * Returns [] when it is ready. Nothing is uploaded until this passes.
   */
  validate() {
    const problems = [];

    if (!this.shopId) problems.push("Choose the shop this product belongs to.");
    if (!this.name.trim()) problems.push("Give the product a name.");
    if (!this.categoryCode) problems.push("Choose a category.");
    if (!this.modelFile) problems.push("Attach a .glb model.");
    if (this.inspection && !this.inspection.isUsable) {
      problems.push(...this.inspection.errors.map((e) => e.message));
    }
    if (!this.roomTypes.length) {
      problems.push(
        "Choose at least one room type -- a product scoped to nothing can " +
        "never be placed anywhere."
      );
    }
    if (this.price !== "" && this.priceCents === null) {
      problems.push(`"${this.price}" is not a price.`);
    }
    return problems;
  }

  /**
   * Write the whole thing.
   *
   * @param {(step: string) => void} [onProgress] told what is happening, so a
   *        30MB upload does not look like a frozen dialog
   * @returns {Promise<{productId: string, variantId: string, qualifiedId: string}>}
   */
  async save(onProgress = () => {}) {
    const problems = this.validate();
    if (problems.length) throw new ValidationError(problems);

    const supabase = getSupabase();
    if (!supabase) throw new Error("No database is configured.");

    const store = new AssetStore(supabase);
    const slug = await this.#uniqueSlug(supabase);

    // -- 1. the listing, as a draft --------------------------------------
    onProgress("Creating the product…");
    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        shop_id: this.shopId,
        slug,
        sku: this.sku.trim() || null,
        name: this.name.trim(),
        description: this.description.trim() || null,
        category_code: this.categoryCode,
        status: "draft",
        price_cents: this.priceCents,
        currency: this.currency,
        width_mm: numberOrNull(this.dimensions.width),
        depth_mm: numberOrNull(this.dimensions.depth),
        height_mm: numberOrNull(this.dimensions.height),
      })
      .select()
      .single();

    if (productError) throw new Error(explain(productError));

    try {
      // -- 2. where it may stand -----------------------------------------
      if (this.roomTypes.length) {
        const { error } = await supabase.from("product_room_types").insert(
          this.roomTypes.map((room_type) => ({
            product_id: product.id,
            room_type,
          }))
        );
        if (error) throw new Error(explain(error));
      }

      // -- 3. the pictures -----------------------------------------------
      let thumbnail = null;
      for (const [index, image] of this.images.entries()) {
        onProgress(`Uploading image ${index + 1} of ${this.images.length}…`);
        const url = await store.putImage(image, {
          shopSlug: this.shopSlug,
          productSlug: slug,
          index,
        });
        if (index === 0) thumbnail = url;

        const { error } = await supabase.from("product_media").insert({
          product_id: product.id,
          url,
          kind: "image",
          alt: this.name.trim(),
          sort_order: index,
        });
        if (error) throw new Error(explain(error));
      }

      // -- 4. the model --------------------------------------------------
      onProgress(`Uploading the model…`);
      const modelUrl = await store.putModel(this.modelFile, {
        shopSlug: this.shopSlug,
        productSlug: slug,
        variantSlug: "default",
      });

      onProgress("Recording the variant…");
      const { data: variant, error: variantError } = await supabase
        .from("product_variants")
        .insert({
          product_id: product.id,
          slug: "default",
          name: "Standard",
          model_url: modelUrl,
          // Measured once, applied on every load. See ModelInspector.
          anchor: this.inspection?.anchor ?? null,
          model_bytes: this.inspection?.bytes ?? null,
          triangle_count: this.inspection?.triangles ?? null,
          is_default: true,
        })
        .select()
        .single();

      if (variantError) throw new Error(explain(variantError));

      // -- 5. publish ----------------------------------------------------
      // Last, so the product becomes visible only once it is complete.
      const patch = { status: this.status };
      if (thumbnail) patch.thumbnail_url = thumbnail;
      const { error: statusError } = await supabase
        .from("products")
        .update(patch)
        .eq("id", product.id);
      if (statusError) throw new Error(explain(statusError));

      return {
        productId: product.id,
        variantId: variant.id,
        qualifiedId: `${this.shopSlug}.${slug}`,
        slug,
      };
    } catch (error) {
      // The draft stays. Deleting it here would also throw away the images
      // that did upload, and a draft is harmless -- it is invisible to
      // visitors and appears in the admin list ready to be finished.
      error.productId = product.id;
      throw error;
    }
  }

  /**
   * A slug unique within the shop.
   *
   * `products` has `unique (shop_id, slug)`, so two sofas both called
   * "Corner Unit" would collide -- and the second upload would fail after the
   * files were already in the bucket.
   */
  async #uniqueSlug(supabase) {
    const base = slugify(this.slug || this.name);
    const { data } = await supabase
      .from("products")
      .select("slug")
      .eq("shop_id", this.shopId)
      .like("slug", `${base}%`);

    const taken = new Set((data ?? []).map((row) => row.slug));
    if (!taken.has(base)) return base;
    for (let n = 2; n < 500; n += 1) {
      if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
    }
    return `${base}-${Date.now().toString(36)}`;
  }
}

/** Postgres errors, translated into what the admin should do about them. */
function explain(error) {
  const message = error?.message ?? String(error);
  if (/row-level security/i.test(message)) {
    return (
      "The database refused this write. You are signed in, but not as " +
      "someone who manages this shop."
    );
  }
  if (/duplicate key/i.test(message)) {
    return "Something with that identifier already exists in this shop.";
  }
  if (/violates check constraint "products_slug_check"/i.test(message)) {
    return "The product name must contain at least two letters or digits.";
  }
  return message;
}

export function slugify(value) {
  return (
    String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "product"
  );
}

const numberOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export default ProductDraft;
