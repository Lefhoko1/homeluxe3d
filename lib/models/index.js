/**
 * The domain model.
 *
 * These are the objects the application talks about: a Shop sells Products,
 * a Product may be On Special, a Scene has Slots that Placements fill. Every
 * one is a class with methods, so nothing outside this folder writes a query.
 *
 *     const shop = await Shop.bySlug("bradlows");
 *     const items = await shop.products();
 *     items[0].isOnSpecial();          // true while the promotion runs
 *     items[0].priceLabel();           // "P 18,999"
 *
 *     const scene = await Scene.bySlug("3bed");
 *     await scene.placements();        // everything standing in it
 *     await scene.availableSlots("bedroom");   // what is still for sale
 *
 * Row-level security decides what any of these can actually see -- see the
 * note at the top of Model.js for why that matters here.
 */

import { Model, money } from "./Model";

export { Model, money, NotConfiguredError } from "./Model";

/* ------------------------------------------------------------------ Shop */

export class Shop extends Model {
  static table = "shops";

  get slug() { return this.row.slug; }
  get name() { return this.row.name; }
  get currency() { return this.row.currency ?? "BWP"; }
  get isActive() { return this.row.status === "active"; }

  static bySlug(slug) {
    return this.findOne({ slug });
  }

  /** Shops currently advertising. */
  static active() {
    return this.findMany({ status: "active" }, { orderBy: "name" });
  }

  products({ publishedOnly = true } = {}) {
    const where = { shop_id: this.id };
    if (publishedOnly) where.status = "published";
    return Product.findMany(where, { orderBy: "name" });
  }

  promotions() {
    return Promotion.findMany({ shop_id: this.id }, { orderBy: "ends_on" });
  }

  /** Followers cannot be listed by a shop -- only counted. */
  followerCount() {
    return Model.client()
      .from("shop_follows")
      .select("*", { count: "exact", head: true })
      .eq("shop_id", this.id)
      .then(({ count }) => count ?? 0);
  }
}

/* --------------------------------------------------------------- Product */

export class Product extends Model {
  static table = "products";

  get slug() { return this.row.slug; }
  get name() { return this.row.name; }
  get sku() { return this.row.sku; }
  get category() { return this.row.category_code; }
  get priceCents() { return this.row.price_cents; }
  get isPublished() { return this.row.status === "published"; }

  priceLabel(currency = this.row.currency) {
    return money(this.priceCents, currency);
  }

  variants() {
    return ProductVariant.findMany({ product_id: this.id });
  }

  defaultVariant() {
    return ProductVariant.findOne({ product_id: this.id, is_default: true });
  }

  promotion() {
    return this.row.promotion_id ? Promotion.findById(this.row.promotion_id) : null;
  }

  /** Room types this suits. An EMPTY list means any room. */
  async roomTypes() {
    const { data, error } = await Model.client()
      .from("product_room_types")
      .select("room_type")
      .eq("product_id", this.id);
    if (error) throw new Error(`Product.roomTypes: ${error.message}`);
    return (data ?? []).map((r) => r.room_type);
  }

  async fitsRoom(roomType) {
    const scoped = await this.roomTypes();
    return scoped.length === 0 || scoped.includes(roomType);
  }

  /**
   * Is this being advertised right now?
   *
   * Asks the database rather than reimplementing the rule, so the answer
   * cannot drift from what the read model actually shows.
   */
  async isActive() {
    const { data, error } = await Model.client()
      .rpc("product_is_active", { p_product: this.id });
    if (error) throw new Error(`Product.isActive: ${error.message}`);
    return Boolean(data);
  }
}

export class ProductVariant extends Model {
  static table = "product_variants";

  get modelUrl() { return this.row.model_url; }
  get materialName() { return this.row.material_name; }
  get textureUrl() { return this.row.texture_url; }

  /** A finish dresses a surface; an object is placed in a room. */
  get isFinish() { return !this.row.model_url && Boolean(this.row.material_name); }
}

/* ------------------------------------------------------------- Promotion */

export class Promotion extends Model {
  static table = "promotions";

  get label() { return this.row.label; }
  get endsOn() { return this.row.ends_on; }

  /**
   * Running today?
   *
   * Computed here from the dates rather than asking the server, because this
   * is called while rendering and a round trip per advert would be absurd.
   */
  isLive(today = new Date()) {
    const day = today.toISOString().slice(0, 10);
    const { starts_on: starts, ends_on: ends } = this.row;
    if (starts && day < starts) return false;
    if (ends && day > ends) return false;
    return true;
  }

  daysRemaining(today = new Date()) {
    if (!this.row.ends_on) return null;
    const end = new Date(`${this.row.ends_on}T23:59:59Z`);
    return Math.ceil((end - today) / 86400000);
  }
}

/* ----------------------------------------------------------------- Scene */

export class Scene extends Model {
  static table = "scenes";

  get slug() { return this.row.slug; }
  get name() { return this.row.name; }

  static bySlug(slug) {
    return this.findOne({ slug });
  }

  static published() {
    return this.findMany({ is_published: true }, { orderBy: "name" });
  }

  rooms() {
    return Room.findMany({ scene_id: this.id }, { orderBy: "sort_order" });
  }

  /** Everything standing in this scene, ready to render. */
  placements() {
    return LivePlacement.findMany({ scene_slug: this.slug });
  }

  /**
   * Advertising space still for sale, optionally for one kind of room.
   *
   * This is the shop-facing question: "what can I buy?"
   */
  availableSlots(roomType = null) {
    const where = { scene_slug: this.slug };
    if (roomType) where.room_type = roomType;
    return AvailableSlot.findMany(where, { orderBy: "room_type" });
  }
}

export class Room extends Model {
  static table = "rooms";
  get code() { return this.row.code; }
  get roomType() { return this.row.room_type; }
}

/* ------------------------------------------------------------ Read model */

/**
 * A row of `v_live_placements`: one placed product with its shop, price and
 * promotion already joined on. Read-only by nature -- it is a view.
 */
export class LivePlacement extends Model {
  static table = "v_live_placements";

  get productId() { return this.row.qualified_id; }
  get productName() { return this.row.product_name; }
  get shopName() { return this.row.shop_name; }
  get roomType() { return this.row.room_type; }
  get modelUrl() { return this.row.model_url; }

  get onSpecial() { return Boolean(this.row.promo_is_live); }

  priceLabel() {
    return money(this.row.effective_price_cents, this.row.currency);
  }

  wasPriceLabel() {
    return this.onSpecial &&
      this.row.effective_price_cents < this.row.price_cents
      ? money(this.row.price_cents, this.row.currency)
      : null;
  }

  /** Position in three.js metres, Y-up. Mirrors Placement.as_dict. */
  position() {
    return [
      (this.row.x_mm ?? 0) / 1000,
      (this.row.z_mm ?? 0) / 1000,
      -((this.row.y_mm ?? 0) / 1000),
    ];
  }

  /** Everything the advert panel shows when this is clicked. */
  toAdvert() {
    return {
      productId: this.productId,
      name: this.productName,
      shop: this.row.shop_slug,
      shopName: this.shopName,
      category: this.row.category_code,
      description: this.row.description,
      sku: this.row.sku,
      colour: this.row.colour,
      currency: this.row.currency,
      price: this.row.price_cents / 100,
      effectivePrice: this.row.effective_price_cents / 100,
      room: this.row.room_code,
      roomTypes: this.row.room_types ?? [],
      isActive: true,      // the view only returns active products
      placementId: this.row.placement_id,
      promotion: this.onSpecial
        ? {
            label: this.row.promo_label,
            terms: this.row.promo_terms,
            startsOn: this.row.promo_starts_on,
            endsOn: this.row.promo_ends_on,
            isLive: true,
          }
        : null,
      dimensions: this.row.width_mm
        ? {
            width: this.row.width_mm,
            depth: this.row.depth_mm,
            height: this.row.height_mm,
          }
        : null,
    };
  }
}

/** A row of `v_available_slots`: inventory a shop could still buy. */
export class AvailableSlot extends Model {
  static table = "v_available_slots";

  get code() { return this.row.code; }
  get label() { return this.row.label; }
  get roomType() { return this.row.room_type; }
  get isPremium() { return Boolean(this.row.is_premium); }

  priceLabel(currency = "BWP") {
    return money(this.row.base_price_cents, currency);
  }

  /** Would this product physically fit? */
  fits({ width_mm: w, depth_mm: d, height_mm: h } = {}) {
    const under = (value, limit) => limit == null || value == null || value <= limit;
    return under(w, this.row.max_width_mm)
        && under(d, this.row.max_depth_mm)
        && under(h, this.row.max_height_mm);
  }
}
