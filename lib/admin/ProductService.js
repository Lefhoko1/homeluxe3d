/**
 * Managing products that already exist.
 *
 * Reads `v_admin_products`, which is the opposite of the catalogue view: it
 * shows EVERYTHING the caller may manage, including drafts, products with no
 * model yet, and products nobody has placed. Those are precisely the rows
 * that need attention, and `v_live_placements` hides all of them by design.
 *
 * Which rows come back is decided by the row-level security policy on
 * `products`, not by a filter here -- a shop manager sees their shop, a
 * platform admin sees every shop, and neither has to ask for the right one.
 */

import { getSupabase } from "../supabase/client";
import { AssetStore } from "../storage/AssetStore";

export class ProductService {
  constructor(client = null) {
    this.client = client ?? getSupabase();
  }

  #db() {
    if (!this.client) throw new Error("No database is configured.");
    return this.client;
  }

  /** Everything manageable, newest first. */
  async list({ shopId = null } = {}) {
    let query = this.#db()
      .from("v_admin_products")
      .select("*")
      .order("created_at", { ascending: false });
    if (shopId) query = query.eq("shop_id", shopId);

    const { data, error } = await query;
    if (error) throw new Error(explain(error));
    return data ?? [];
  }

  /** The variants of a product -- what the "place in house" button needs. */
  async variants(productId) {
    const { data, error } = await this.#db()
      .from("product_variants")
      .select("id, slug, name, colour, model_url, anchor, is_default")
      .eq("product_id", productId)
      .order("is_default", { ascending: false });
    if (error) throw new Error(explain(error));
    return data ?? [];
  }

  /** draft | published | archived. Unpublishing removes it from the scene. */
  async setStatus(productId, status) {
    const { error } = await this.#db()
      .from("products")
      .update({ status })
      .eq("id", productId);
    if (error) throw new Error(explain(error));
    return true;
  }

  /**
   * Delete a product and the files behind it.
   *
   * The database cascades to variants, media, room types and placements. The
   * BUCKET does not cascade -- storage knows nothing about these tables -- so
   * the files are collected first and removed after, or they sit there
   * forever with nothing pointing at them.
   *
   * Storage failures are logged rather than thrown: the row is already gone,
   * and reporting failure at that point would be a lie.
   */
  async remove(productId) {
    const db = this.#db();

    const [{ data: variants }, { data: media }, { data: product }] = await Promise.all([
      db.from("product_variants").select("model_url").eq("product_id", productId),
      db.from("product_media").select("url").eq("product_id", productId),
      db.from("products").select("thumbnail_url").eq("id", productId).maybeSingle(),
    ]);

    const urls = [
      ...(variants ?? []).map((v) => v.model_url),
      ...(media ?? []).map((m) => m.url),
      product?.thumbnail_url,
    ].filter(Boolean);

    const { error } = await db.from("products").delete().eq("id", productId);
    if (error) throw new Error(explain(error));

    try {
      const store = new AssetStore(db);
      await Promise.all([...new Set(urls)].map((url) => store.remove(url)));
    } catch (storageError) {
      console.warn(
        "[admin] product deleted, but some files were left in storage:",
        storageError?.message
      );
    }
    return true;
  }

  /** Categories for the upload form. Readable by everyone. */
  async categories() {
    const { data, error } = await this.#db()
      .from("product_categories")
      .select("code, name, kind")
      .order("sort_order");
    if (error) throw new Error(explain(error));
    return data ?? [];
  }
}

function explain(error) {
  const message = error?.message ?? String(error);
  if (/row-level security/i.test(message)) {
    return "The database refused this. You do not manage this shop.";
  }
  return message;
}

export default ProductService;
