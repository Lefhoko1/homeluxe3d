/**
 * Everything the admin screens read and write.
 *
 * ONE FILE, BECAUSE THE SHAPE OF THE QUESTION IS THE INTERESTING PART. The
 * admin is a dozen screens over the same twenty tables, and written as a
 * dozen components each holding its own `.from(...).select(...)` the joins
 * drift: two screens disagree about what "live" means, a third forgets that a
 * placement's coordinates can be null and inherits them from the slot. Asking
 * the questions in one place means the answers match.
 *
 * NOTHING HERE INVENTS DATA. Every method throws when the database refuses,
 * and returns whatever the database actually has -- an empty list stays an
 * empty list. A screen that shows a plausible number when its query failed is
 * worse than a screen showing an error, because the error gets fixed.
 *
 * WHICH ROWS COME BACK IS ROW-LEVEL SECURITY'S DECISION, not a filter here. A
 * shop manager reading `shops()` sees their own; a platform admin sees all of
 * them; neither has to ask for the right one. Migration 0013 made the views
 * respect that too -- before it, every one of them ran as the table owner and
 * answered everybody with everything.
 */

import { getSupabase } from "../supabase/client";

export class AdminData {
  constructor(client = null) {
    this.client = client ?? getSupabase();
  }

  #db() {
    if (!this.client) {
      throw new Error(
        "No database is configured, so there is nothing to administer."
      );
    }
    return this.client;
  }

  /** Run a query and turn a Postgres refusal into something readable. */
  async #rows(query, what) {
    const { data, error } = await query;
    if (error) throw new Error(explain(error, what));
    return data ?? [];
  }

  async #one(query, what) {
    const { data, error } = await query;
    if (error) throw new Error(explain(error, what));
    return data ?? null;
  }

  // -- Dashboard ---------------------------------------------------------

  /**
   * The counts on the front page (section 46).
   *
   * Counted with `head: true`, so Postgres returns the number and not the
   * rows -- the placements table is the one that will grow, and the dashboard
   * should not get slower as the business gets bigger.
   *
   * Run together rather than in sequence: eleven round trips one after
   * another is most of a second on a slow connection, for a screen whose
   * whole job is to load immediately.
   */
  async dashboard() {
    const db = this.#db();
    const count = (table, build = (q) => q) =>
      build(db.from(table).select("*", { count: "exact", head: true }));

    const [
      shops, products, materials, assets, slots, freeSlots,
      livePlacements, requests, failedAssets, campaigns, enquiries,
    ] = await Promise.all([
      count("shops"),
      count("products"),
      count("materials"),
      count("assets"),
      count("placement_slots", (q) => q.eq("is_active", true)),
      count("v_available_slots"),
      count("placements", (q) => q.eq("status", "live")),
      count("v_content_queue"),
      count("asset_versions", (q) => q.eq("status", "failed")),
      count("campaigns", (q) => q.eq("status", "live")),
      count("enquiries", (q) => q.eq("status", "new")),
    ]);

    const first = [
      shops, products, materials, assets, slots, freeSlots,
      livePlacements, requests, failedAssets, campaigns, enquiries,
    ].find((r) => r.error);
    if (first) throw new Error(explain(first.error, "the dashboard counts"));

    return {
      shops: shops.count ?? 0,
      products: products.count ?? 0,
      materials: materials.count ?? 0,
      assets: assets.count ?? 0,
      slots: slots.count ?? 0,
      freeSlots: freeSlots.count ?? 0,
      livePlacements: livePlacements.count ?? 0,
      openRequests: requests.count ?? 0,
      failedAssets: failedAssets.count ?? 0,
      activeCampaigns: campaigns.count ?? 0,
      newEnquiries: enquiries.count ?? 0,
    };
  }

  /** The last things that happened, for the dashboard's activity list. */
  async recentActivity(limit = 12) {
    return this.#rows(
      this.#db()
        .from("audit_logs")
        .select("id, action, entity_type, entity_id, metadata, at, actor_id")
        .order("at", { ascending: false })
        .limit(limit),
      "recent activity"
    );
  }

  // -- Shops (section 47) ------------------------------------------------

  async shops() {
    return this.#rows(
      this.#db()
        .from("shops")
        .select("id, slug, name, tagline, status, currency, city, country, email, phone, website, created_at")
        .order("name"),
      "the shops"
    );
  }

  async saveShop(shop) {
    const patch = {
      slug: shop.slug?.trim(),
      name: shop.name?.trim(),
      tagline: shop.tagline?.trim() || null,
      currency: shop.currency || "BWP",
      city: shop.city?.trim() || null,
      country: shop.country?.trim() || null,
      email: shop.email?.trim() || null,
      phone: shop.phone?.trim() || null,
      website: shop.website?.trim() || null,
    };
    if (!patch.name) throw new Error("A shop needs a name.");
    if (!patch.slug) throw new Error("A shop needs a slug -- it is in every asset path.");

    const db = this.#db();
    const query = shop.id
      ? db.from("shops").update(patch).eq("id", shop.id).select().single()
      : db.from("shops").insert({ ...patch, status: "active" }).select().single();
    return this.#one(query, "the shop");
  }

  /**
   * Suspend or reactivate.
   *
   * A SUSPENDED SHOP DISAPPEARS FROM THE HOUSE without anything being
   * deleted: `shop_is_live` is in the read policy on products and placements,
   * so its products stop resolving and its placements stop being live. That
   * is the whole point of having a status rather than a delete button.
   */
  async setShopStatus(shopId, status) {
    return this.#one(
      this.#db().from("shops").update({ status }).eq("id", shopId).select().single(),
      "the shop's status"
    );
  }

  /**
   * Who runs a shop.
   *
   * Read from `v_shop_members`, which joins the display name on for us --
   * `auth.users` is not readable from a browser and must not be, so a name is
   * the most a screen can show about somebody.
   */
  async shopMembers(shopId) {
    return this.#rows(
      this.#db()
        .from("v_shop_members")
        .select("shop_id, user_id, role, created_at, display_name, platform_role")
        .eq("shop_id", shopId)
        .order("role"),
      "the shop's members"
    );
  }

  /**
   * Add somebody to a shop, by the only thing an operator actually has: an
   * address. The lookup happens inside the database, where it can check the
   * caller may manage the shop before it goes anywhere near `auth.users`.
   *
   * This GRANTS ACCESS, it does not create people. An address with no account
   * is refused, loudly, rather than filed as an invitation nobody sees.
   */
  async inviteMember(shopId, email, role = "staff") {
    const { data, error } = await this.#db().rpc("invite_shop_member", {
      p_shop: shopId,
      p_email: email,
      p_role: role,
    });
    if (error) throw new Error(explain(error, "the invitation"));
    return data;
  }

  async removeMember(shopId, userId) {
    const { error } = await this.#db().rpc("remove_shop_member", {
      p_shop: shopId,
      p_user: userId,
    });
    if (error) throw new Error(explain(error, "removing the member"));
    return true;
  }

  // -- Slots and the slot inspector (sections 50, 51) ---------------------

  /**
   * The advertising inventory, with whatever is standing in each position.
   *
   * THE LEFT JOIN IS THE POINT. A slot with no placement is the thing a shop
   * buys, and a query that only returned filled ones would describe the house
   * as sold out. `placements` comes back as an array because PostgREST cannot
   * know it is at most one live row; the caller flattens it.
   */
  async slots({ sceneSlug = "3bed", roomCode = null, onlyFree = false } = {}) {
    let query = this.#db()
      .from("placement_slots")
      .select(`
        id, code, external_id, label, category_code, kind, room_type,
        x_mm, y_mm, z_mm, rotation_deg, priority, is_premium, is_active,
        max_width_mm, max_depth_mm, max_height_mm, origin, base_price_cents,
        rooms(code, name),
        scenes!inner(id, slug),
        placements(id, status, note, variant_id,
                   product_variants(name, products(name, slug, shops(name, slug))))
      `)
      .eq("scenes.slug", sceneSlug)
      .eq("is_active", true)
      .order("code");

    if (roomCode) query = query.eq("rooms.code", roomCode);

    const rows = await this.#rows(query, "the slots");
    const flat = rows.map((row) => {
      const live = (row.placements ?? []).find((p) => p.status === "live");
      const variant = live?.product_variants;
      return {
        ...row,
        room: row.rooms?.name ?? "House-wide",
        roomCode: row.rooms?.code ?? "",
        placementId: live?.id ?? null,
        productName: variant?.products?.name ?? null,
        productSlug: variant?.products?.slug ?? null,
        shopName: variant?.products?.shops?.name ?? null,
        variantName: variant?.name ?? null,
        note: live?.note ?? null,
      };
    });
    return onlyFree ? flat.filter((s) => !s.placementId) : flat;
  }

  /** Which product categories this slot's type will accept (section 51). */
  async slotCompatibility(slotTypeId) {
    if (!slotTypeId) return [];
    return this.#rows(
      this.#db()
        .from("slot_types")
        .select("code, name, category_code, kind, max_width_mm, max_depth_mm, max_height_mm")
        .eq("id", slotTypeId),
      "the slot type"
    );
  }

  /** Everything that has ever been done to one slot, newest first. */
  async slotHistory(slotId) {
    return this.#rows(
      this.#db()
        .from("audit_logs")
        .select("id, action, metadata, before, after, at, actor_id")
        .eq("entity_type", "slot")
        .eq("entity_id", slotId)
        .order("at", { ascending: false })
        .limit(50),
      "the slot's history"
    );
  }

  /**
   * Empty a slot.
   *
   * The placement is RETIRED, not deleted: `removed` keeps the row, so the
   * analytics that reference it still resolve and "what used to be here?"
   * stays answerable. Section 60 -- soft delete, always.
   *
   * The status values are an ENUM and the names are the contract:
   * draft | live | removed. Guessing "ended" -- which is a campaign status,
   * not a placement one -- gets a 400 from Postgres and a clear slot that
   * quietly is not.
   */
  async clearSlot(placementId) {
    return this.#one(
      this.#db().from("placements").update({ status: "removed" })
        .eq("id", placementId).select().single(),
      "clearing the slot"
    );
  }

  /** Put a product into a slot (section 51's Replace Product). */
  async fillSlot({ slotId, variantId, sceneId, shopId, note = null }) {
    return this.#one(
      this.#db().from("placements").insert({
        scene_id: sceneId,
        slot_id: slotId,
        variant_id: variantId,
        shop_id: shopId,
        status: "live",
        note,
      }).select().single(),
      "filling the slot"
    );
  }

  /** Which slots would actually take this product (section 56). */
  async suggestSlots(productId, sceneSlug = "3bed", limit = 20) {
    const { data, error } = await this.#db().rpc("suggest_slots", {
      p_product: productId,
      p_scene: sceneSlug,
      p_limit: limit,
    });
    if (error) throw new Error(explain(error, "the slot suggestions"));
    return data ?? [];
  }

  // -- Placements --------------------------------------------------------

  async placements({ sceneSlug = "3bed" } = {}) {
    return this.#rows(
      this.#db()
        .from("placements")
        .select(`
          id, status, note, x_mm, y_mm, rotation_deg, created_at, updated_at,
          placement_slots(code, external_id, label),
          shops(name, slug),
          product_variants(name, products(name, slug)),
          scenes!inner(slug)
        `)
        .eq("scenes.slug", sceneSlug)
        .order("status")
        .order("created_at", { ascending: false }),
      "the placements"
    );
  }

  async setPlacementStatus(placementId, status) {
    return this.#one(
      this.#db().from("placements").update({ status }).eq("id", placementId).select().single(),
      "the placement's status"
    );
  }

  // -- Assets (sections 53, 54) ------------------------------------------

  async assets() {
    // THE RELATIONSHIP HAS TO BE NAMED. There are two foreign keys between
    // these tables -- asset_versions.asset_id points at assets, and
    // assets.current_version_id points back -- so PostgREST refuses the
    // embed as ambiguous (PGRST201) rather than guessing. We want the
    // versions OF this asset, which is the first of the two.
    return this.#rows(
      this.#db()
        .from("assets")
        .select(`
          id, name, slug, kind, status, created_at, current_version_id,
          shops(name, slug),
          asset_versions!asset_versions_asset_id_fkey(
            id, version, status, bytes, triangles,
            width_mm, depth_mm, height_mm, failure_reason,
            storage_path, created_at)
        `)
        .order("created_at", { ascending: false }),
      "the assets"
    );
  }

  /** Re-run the size and weight checks on one version (section 54). */
  async validateVersion(versionId) {
    const { data, error } = await this.#db().rpc("validate_asset_version", {
      p_version: versionId,
    });
    if (error) throw new Error(explain(error, "the asset check"));
    return data ?? [];
  }

  // -- Materials (section 49) --------------------------------------------

  async materials() {
    return this.#rows(
      this.#db()
        .from("materials")
        .select(`
          id, code, name, category_code, renderer, procedural_key,
          tile_width_mm, tile_height_mm, base_colour, roughness, metallic,
          status, created_at, shops(name, slug), products(name, slug)
        `)
        .order("name"),
      "the materials"
    );
  }

  /** A material with its texture maps gathered, as the house reads it. */
  async materialFinishes() {
    return this.#rows(
      this.#db()
        .from("v_material_finishes")
        .select("code, name, category_code, renderer, procedural_key, tile_width_mm, base_colour, maps, shop_slug")
        .order("name"),
      "the material finishes"
    );
  }

  /**
   * Upload one texture map and attach it to a material.
   *
   * TWO STEPS THAT MUST BOTH HAPPEN. The file goes to storage, then the
   * database records it as a numbered asset version and points the material
   * at it. Doing only the first leaves a file nothing references -- which is
   * exactly the state `assets` was in for four migrations.
   *
   * The path is `<material-code>/<map-type>.<ext>`, and the storage policy
   * reads the material code out of it to decide who may write. Uploading with
   * upsert replaces the file; the VERSION history lives in the database,
   * where it can be looked at.
   */
  async uploadMaterialMap(file, { materialCode, mapType, resolution = null }) {
    if (!file) throw new Error("Choose an image first.");
    const db = this.#db();

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${materialCode}/${mapType}.${ext}`;

    const { error: uploadError } = await db.storage
      .from("material-maps")
      .upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: true,
        cacheControl: "31536000",
      });
    if (uploadError) {
      throw new Error(
        /row-level security|not authorized/i.test(uploadError.message)
          ? `Storage refused this. ${materialCode} belongs to the platform or ` +
            `to another shop, and you may not supply its maps.`
          : uploadError.message
      );
    }

    const { data, error } = await db.rpc("ingest_material_map", {
      p_material_code: materialCode,
      p_map_type: mapType,
      p_storage_path: path,
      p_mime: file.type || null,
      p_bytes: file.size,
      p_resolution: resolution,
    });
    if (error) throw new Error(explain(error, "recording the texture"));
    return data;
  }

  /** The public URL for a stored map, for a preview. */
  mapUrl(storagePath) {
    if (!storagePath) return null;
    const { data } = this.#db().storage.from("material-maps").getPublicUrl(storagePath);
    return data?.publicUrl ?? null;
  }

  async setMaterialStatus(id, status) {
    return this.#one(
      this.#db().from("materials").update({ status }).eq("id", id).select().single(),
      "the material's status"
    );
  }

  // -- Campaigns and batches (sections 37, 86) ---------------------------

  async campaigns() {
    return this.#rows(
      this.#db()
        .from("campaigns")
        .select("id, name, status, starts_at, ends_at, created_at, shops(name, slug)")
        .order("created_at", { ascending: false }),
      "the campaigns"
    );
  }

  async saveCampaign(campaign) {
    const patch = {
      shop_id: campaign.shopId,
      name: campaign.name?.trim(),
      starts_at: campaign.startsAt || null,
      ends_at: campaign.endsAt || null,
    };
    if (!patch.name) throw new Error("A campaign needs a name.");
    if (!patch.shop_id) throw new Error("A campaign belongs to a shop.");

    const db = this.#db();
    const query = campaign.id
      ? db.from("campaigns").update(patch).eq("id", campaign.id).select().single()
      : db.from("campaigns").insert({ ...patch, status: "draft" }).select().single();
    return this.#one(query, "the campaign");
  }

  async setCampaignStatus(id, status) {
    return this.#one(
      this.#db().from("campaigns").update({ status }).eq("id", id).select().single(),
      "the campaign's status"
    );
  }

  /** The rotation schedule: which shops are up, and when. */
  async batches() {
    return this.#rows(
      this.#db().from("v_batch_schedule").select("*"),
      "the batch schedule"
    );
  }

  // -- Publishing (sections 39, 88, 89) ----------------------------------

  async publishedScenes(sceneSlug = "3bed") {
    return this.#rows(
      this.#db()
        .from("published_scenes")
        .select("id, version, status, placement_count, shop_count, notes, published_at, built_at, scenes!inner(slug)")
        .eq("scenes.slug", sceneSlug)
        .order("version", { ascending: false }),
      "the published versions"
    );
  }

  /**
   * Publish the live scene as a numbered snapshot.
   *
   * Called through `rpc`, which invokes the function ONCE. Written as
   * `select (publish_scene(...)).*` in SQL it is evaluated once per column of
   * the composite it returns -- which published the scene thirteen times
   * before anybody noticed, and did the same to `register_asset` later.
   */
  async publishScene(sceneSlug = "3bed", notes = null) {
    // p_slug, not p_scene. The names are the contract and I got them wrong
    // the first time -- PostgREST answers a mismatched argument name with
    // "function not found", which reads like the migration was never applied.
    const { data, error } = await this.#db().rpc("publish_scene", {
      p_slug: sceneSlug,
      p_notes: notes,
    });
    if (error) throw new Error(explain(error, "publishing"));
    return Array.isArray(data) ? data[0] : data;
  }

  async rollbackScene(sceneSlug, version) {
    const { data, error } = await this.#db().rpc("rollback_scene", {
      p_slug: sceneSlug,
      p_to_version: version,
    });
    if (error) throw new Error(explain(error, "the rollback"));
    return Array.isArray(data) ? data[0] : data;
  }

  // -- Analytics (sections 90 to 93) -------------------------------------

  async shopStats() {
    return this.#rows(
      this.#db()
        .from("v_shop_daily_stats")
        .select("shop_id, day, views, clicks, expands, enquiries, sessions")
        .order("day", { ascending: false })
        .limit(180),
      "the shop statistics"
    );
  }

  /**
   * Which products people actually looked at (section 93).
   *
   * Counted in the browser rather than by the database because there is no
   * view for it yet and `interaction_events` is small. When it stops being
   * small this becomes a view, and this method keeps its signature.
   */
  async productPerformance() {
    const rows = await this.#rows(
      this.#db()
        .from("interaction_events")
        .select("event, variant_id, shop_id, session_id, product_variants(name, products(name, slug, shops(name)))")
        .not("variant_id", "is", null)
        .limit(5000),
      "the product performance"
    );

    const byVariant = new Map();
    for (const row of rows) {
      const key = row.variant_id;
      if (!byVariant.has(key)) {
        byVariant.set(key, {
          variantId: key,
          product: row.product_variants?.products?.name ?? "(unknown)",
          shop: row.product_variants?.products?.shops?.name ?? "",
          views: 0, clicks: 0, expands: 0, enquiries: 0,
          sessions: new Set(),
        });
      }
      const entry = byVariant.get(key);
      if (row.session_id) entry.sessions.add(row.session_id);
      if (row.event === "placement_view") entry.views += 1;
      else if (row.event === "product_click") entry.clicks += 1;
      else if (row.event === "product_expand") entry.expands += 1;
      else if (row.event === "enquiry_open") entry.enquiries += 1;
    }

    return [...byVariant.values()]
      .map((e) => ({ ...e, sessions: e.sessions.size }))
      .sort((a, b) => b.views - a.views);
  }

  async enquiries() {
    return this.#rows(
      this.#db()
        .from("enquiries")
        .select("id, name, email, phone, message, status, created_at, shops(name), products(name)")
        .order("created_at", { ascending: false })
        .limit(200),
      "the enquiries"
    );
  }

  async setEnquiryStatus(id, status) {
    return this.#one(
      this.#db().from("enquiries").update({ status }).eq("id", id).select().single(),
      "the enquiry"
    );
  }

  // -- Users and roles (sections 7, 8, 9) --------------------------------

  async people() {
    return this.#rows(
      this.#db()
        .from("profiles")
        .select("id, display_name, role, phone, created_at")
        .order("created_at"),
      "the people"
    );
  }

  async roles() {
    return this.#rows(
      this.#db()
        .from("roles")
        .select("code, name, description, scope, sort_order")
        .order("sort_order"),
      "the roles"
    );
  }

  async rolePermissions() {
    return this.#rows(
      this.#db().from("role_permissions").select("role_code, permission_code"),
      "the permissions"
    );
  }

  async setPersonRole(profileId, role) {
    return this.#one(
      this.#db().from("profiles").update({ role }).eq("id", profileId).select().single(),
      "the person's role"
    );
  }

  // -- Audit (section 59) ------------------------------------------------

  async auditLog({ limit = 200, action = null, entityType = null } = {}) {
    let query = this.#db()
      .from("audit_logs")
      .select("id, actor_id, action, entity_type, entity_id, before, after, metadata, at")
      .order("at", { ascending: false })
      .limit(limit);
    if (action) query = query.eq("action", action);
    if (entityType) query = query.eq("entity_type", entityType);
    return this.#rows(query, "the audit log");
  }

  // -- Reference data ----------------------------------------------------

  async scenes() {
    return this.#rows(
      this.#db().from("scenes").select("id, slug, name, is_published").order("name"),
      "the scenes"
    );
  }

  async rooms(sceneSlug = "3bed") {
    return this.#rows(
      this.#db()
        .from("rooms")
        .select("id, code, name, room_type, sort_order, scenes!inner(slug)")
        .eq("scenes.slug", sceneSlug)
        .order("sort_order"),
      "the rooms"
    );
  }

  async categories() {
    return this.#rows(
      this.#db().from("product_categories").select("code, name, kind, sort_order").order("sort_order"),
      "the categories"
    );
  }

  /** Products with a placeable variant, for the slot inspector's picker. */
  async placeableProducts() {
    return this.#rows(
      this.#db()
        .from("products")
        .select("id, name, slug, category_code, status, shop_id, shops(name), product_variants(id, name, is_default, model_url)")
        .eq("status", "published")
        .order("name"),
      "the products"
    );
  }
}

/**
 * Turn a Postgres refusal into a sentence that says what to do.
 *
 * The raw messages are accurate and useless to somebody looking at a screen:
 * "new row violates row-level security policy for table" does not tell an
 * operator that they are not a member of the shop they just tried to edit.
 */
function explain(error, what = "that") {
  const message = error?.message ?? String(error);
  if (/row-level security/i.test(message)) {
    return `The database refused to show or change ${what}. You do not manage that shop.`;
  }
  if (/permission denied/i.test(message)) {
    return `You are not allowed to see ${what}. It needs a platform admin.`;
  }
  if (/JWT|not authenticated/i.test(message)) {
    return "Your session has expired. Sign in again.";
  }
  if (/does not exist/i.test(message)) {
    return `${capital(what)} is missing from the database -- a migration has not been applied. (${message})`;
  }
  return `${capital(what)}: ${message}`;
}

const capital = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export default AdminData;
