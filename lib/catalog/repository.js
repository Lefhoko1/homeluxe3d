/**
 * Catalogue repository.
 *
 * ONE shape, TWO sources. The 3D app asks for a scene's catalogue and gets the
 * same structure whether it came from Supabase or from the static
 * catalog.json the Blender build writes:
 *
 *     { source, shops: [...], houses: { <slug>: [placement, ...] } }
 *
 * Database first, static file as the fallback. That ordering matters: the
 * database is the live, editable truth once a shop starts managing its own
 * products, and the file is the last-known-good snapshot that keeps the
 * showroom standing if the database is unreachable, unconfigured, or empty.
 *
 * The fallback is not a development convenience. An advertising site that goes
 * blank when its database hiccups is worse than one showing yesterday's
 * layout.
 */

import { getSupabase } from "../supabase/client";

export const STATIC_CATALOG_URL = "/models/products/catalog.json";

/** Millimetres in the scene's own space -> three.js metres, Y-up. */
function toThreePosition(xMm, yMm, zMm) {
  // Blender (x, y, z) maps to three (x, z, -y); see Placement.as_dict.
  return [(xMm ?? 0) / 1000, (zMm ?? 0) / 1000, -((yMm ?? 0) / 1000)];
}

function centsToPrice(cents) {
  return cents == null ? null : cents / 100;
}

/**
 * Reshape `v_live_placements` rows into the manifest the 3D app expects.
 *
 * The view is deliberately flat -- one row per placed thing, with its product
 * and shop denormalised onto it -- so this is a grouping, not a join.
 */
export function rowsToManifest(rows, sceneSlug) {
  const shops = new Map();
  const placements = [];

  rows.forEach((row) => {
    if (!shops.has(row.shop_slug)) {
      shops.set(row.shop_slug, {
        id: row.shop_slug,
        name: row.shop_name,
        currency: row.currency,
        products: new Map(),
      });
    }
    const shop = shops.get(row.shop_slug);

    if (!shop.products.has(row.qualified_id)) {
      // Must carry EVERYTHING the advert panel shows, or the database path
      // renders a thinner product than the static file does -- which is
      // exactly the sort of difference that only shows up in production.
      shop.products.set(row.qualified_id, {
        id: row.qualified_id,
        shop: row.shop_slug,
        category: row.category_code,
        name: row.product_name,
        description: row.description,
        sku: row.sku ?? undefined,
        colour: row.colour ?? undefined,
        price: centsToPrice(row.price_cents),
        effectivePrice: centsToPrice(row.effective_price_cents ?? row.price_cents),
        currency: row.currency,
        roomTypes: row.room_types ?? [],
        // The view only returns products that are being advertised, so
        // anything reaching here is active by definition.
        isActive: true,
        dimensions: row.width_mm
          ? { width: row.width_mm, depth: row.depth_mm, height: row.height_mm }
          : undefined,
        promotion: row.promo_is_live
          ? {
              label: row.promo_label,
              terms: row.promo_terms,
              startsOn: row.promo_starts_on,
              endsOn: row.promo_ends_on,
              isLive: true,
            }
          : null,
        model: row.model_url ?? undefined,
        material: row.material_name ?? undefined,
        variantName: row.variant_name ?? undefined,
        swatch: row.swatch ?? undefined,
        texture: row.texture_url ?? undefined,
        thumbnail: row.thumbnail_url ?? undefined,
        shopPhone: row.shop_phone ?? undefined,
        shopEmail: row.shop_email ?? undefined,
        productId: row.product_id,
        variantId: row.variant_id,
      });
    }

    // Objects AND finishes are both listed, because a floor tile is as much
    // an advert in that room as the sofa standing on it.
    //
    // The difference is POSITION: an object stands somewhere, a finish
    // dresses the whole surface. So a finish carries `isFinish` and a null
    // position, and everything downstream keys off that -- the 3D loader
    // skips it, the camera cannot fly to it, but the room list shows it.
    const isFinish = !row.model_url;
    placements.push({
      product: row.qualified_id,
      room: row.room_code ?? "unassigned",
      isFinish,
      // The surface this dresses: the material name Blender baked into
      // the mesh. For a finish this is the whole point of the row.
      surface: isFinish ? (row.slot_material_name ?? row.material_name) : null,
      position: isFinish ? null : toThreePosition(row.x_mm, row.y_mm, row.z_mm),
      rotationY: Number(row.rotation_deg ?? 0),
      scale: Number(row.scale ?? 1),
      note: row.note ?? "",
      placementId: row.placement_id,
    });
  });

  return {
    version: 1,
    source: "supabase",
    shops: [...shops.values()].map((s) => ({
      ...s,
      products: [...s.products.values()],
    })),
    houses: { [sceneSlug]: placements },
  };
}

/** Read the scene's catalogue from Supabase. Returns null if unavailable. */
async function fetchFromDatabase(sceneSlug) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("v_live_placements")
    .select("*")
    .eq("scene_slug", sceneSlug);

  if (error) {
    console.warn("[catalog] database read failed, falling back:", error.message);
    return null;
  }
  if (!data?.length) {
    // An empty result is not an error -- the project may simply not be seeded
    // yet -- but it is not something to dress a scene with either.
    console.info("[catalog] database returned no placements, falling back");
    return null;
  }

  return rowsToManifest(data, sceneSlug);
}

/** Read the catalogue the Blender build wrote. */
async function fetchStatic(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`catalog ${url} -> HTTP ${response.status}`);
  const manifest = await response.json();
  return { ...manifest, source: "static" };
}

/**
 * The scene's catalogue, from whichever source can supply it.
 *
 * @returns {Promise<{source: string, shops: Array, houses: object}>}
 */
export async function fetchSceneCatalog({
  scene = "3bed",
  staticUrl = STATIC_CATALOG_URL,
} = {}) {
  try {
    const fromDb = await fetchFromDatabase(scene);
    if (fromDb) return fromDb;
  } catch (error) {
    console.warn("[catalog] database unavailable, falling back:", error?.message);
  }
  return fetchStatic(staticUrl);
}

/**
 * Record an interaction. Fire-and-forget: analytics must never be able to
 * break a tour, so every failure is swallowed after a console warning.
 *
 * This is what a shop is actually buying -- proof that its placement was seen
 * and clicked -- so it is wired in from the start rather than bolted on.
 */
export async function recordEvent(event, payload = {}) {
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    await supabase.from("interaction_events").insert({
      event,
      session_id: sessionId(),
      shop_id: payload.shopId ?? null,
      scene_id: payload.sceneId ?? null,
      placement_id: payload.placementId ?? null,
      variant_id: payload.variantId ?? null,
      metadata: payload.metadata ?? {},
    });
  } catch (error) {
    console.warn("[analytics] dropped event", event, error?.message);
  }
}

/** Per-tab id so anonymous visitors can still be counted as one session. */
let cachedSession = null;
function sessionId() {
  if (cachedSession) return cachedSession;
  if (typeof window === "undefined") return null;
  try {
    const key = "homeluxe.session";
    cachedSession = window.sessionStorage.getItem(key);
    if (!cachedSession) {
      cachedSession = crypto.randomUUID();
      window.sessionStorage.setItem(key, cachedSession);
    }
  } catch {
    cachedSession = crypto.randomUUID();   // private mode, no storage
  }
  return cachedSession;
}
