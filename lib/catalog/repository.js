/**
 * Catalogue repository.
 *
 * ONE source: the database.
 *
 *     { source, shops: [...], houses: { <slug>: [placement, ...] } }
 *
 * THERE IS NO FALLBACK, AND THAT IS THE POINT. This used to drop back to the
 * static catalog.json the Blender build writes whenever Supabase was
 * unconfigured, unreachable or empty, on the reasoning that an advertising
 * site which goes blank when its database hiccups is worse than one showing
 * yesterday's layout.
 *
 * That reasoning is wrong here, and it cost real time. A shop was added to
 * the catalogue and seeded into a file, the database was never updated, and
 * the app kept serving a house that looked perfectly fine -- the missing
 * shop, the missing bed and the missing photographs all looked like bugs in
 * the 3D scene rather than like a database that had never been told. A
 * fallback that hides a broken wiring is not resilience; it is a silent
 * failure with a fresh coat of paint, and the whole business runs on the
 * database being right.
 *
 * So a catalogue failure is now an ERROR, loudly, in the UI. The house still
 * loads -- walls, floors, the tour route -- because that is the building and
 * it comes from the Blender build. What does not appear is the merchandise,
 * and the page says why.
 *
 * catalog.json is still written by the build and still read by the route
 * solver and the tests. It is a build artefact, not a runtime source.
 */

import { getSupabase } from "../supabase/client";
import { mmToThree } from "../scene/transforms";

/**
 * Where the Blender build writes its catalogue.
 *
 * A BUILD ARTEFACT, NOT A RUNTIME SOURCE. The route solver reads it to place
 * furniture on the grid and the tests read it to know what is in the house.
 * Nothing in the browser does any more -- see the note at the top of this
 * file about why the fallback was removed.
 */
export const STATIC_CATALOG_URL = "/models/products/catalog.json";

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
        // The shop's own mark. The browser used to keep an emoji per slug,
        // which a fourth shop was never going to be in; with no logo the
        // chip falls back to the shop's initial, which every shop has.
        logoUrl: row.shop_logo_url ?? null,
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
        // Every photograph, thumbnail first. The advert panel shows these;
        // until now the column was carried all the way to the browser and
        // then rendered by nothing.
        media: row.media_urls?.length ? row.media_urls : undefined,
        // Correction for an uploaded model that was not built at the origin.
        // Blender-built products have none and are unaffected.
        anchor: row.anchor ?? undefined,
        shopPhone: row.shop_phone ?? undefined,
        shopEmail: row.shop_email ?? undefined,
        shopLogoUrl: row.shop_logo_url ?? undefined,
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
      // WHAT THE ROOM IS CALLED AND WHERE IT COMES, from the database. The
      // browser used to keep its own table of thirteen room names beside a
      // database that already had them, and sort the codes alphabetically --
      // which is nobody's route through a house. See migration 0018.
      roomName: row.room_name ?? null,
      roomSort: row.room_sort ?? null,
      roomType: row.room_type ?? null,
      isFinish,
      // The surface this dresses: the material name Blender baked into
      // the mesh. For a finish this is the whole point of the row.
      surface: isFinish ? (row.slot_material_name ?? row.material_name) : null,
      position: isFinish ? null : mmToThree(row.x_mm, row.y_mm, row.z_mm),
      rotationY: Number(row.rotation_deg ?? 0),
      scale: Number(row.scale ?? 1),
      note: row.note ?? "",
      placementId: row.placement_id,
      // Carried so the placement editor can save a move back to the right
      // row without re-querying: a placement is edited, a variant is placed.
      variantId: row.variant_id,
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

/**
 * The scene's catalogue.
 *
 * TWO READS, ON PURPOSE, and which one you get depends on who is asking.
 *
 *   PUBLIC  -> `v_current_scene`, the newest PUBLISHED snapshot.
 *   ADMIN   -> `v_live_placements`, the database as it stands this instant.
 *
 * A visitor should see a house somebody decided to show them, not whatever
 * state an admin's half-finished rearrangement is in -- that is what
 * publishing is for. But an admin dragging a sofa has to see it move, and
 * making them publish to check their own work would be unusable.
 *
 * The two are the SAME SHAPE because `resolve_scene` builds the snapshot by
 * reading `v_live_placements`; the payload's placements are its rows, as
 * JSON. So `rowsToManifest` handles both and neither path can grow a field
 * the other lacks.
 *
 * THROWS rather than returning something plausible. Each way this can fail is
 * a different thing being wrong, and each says so, because "no products in
 * the house" on its own sends you looking at the 3D scene -- which is the one
 * place the fault will never be.
 *
 * @param {boolean} options.live  read the draft instead of the snapshot
 * @throws {Error} unconfigured, unreachable, unseeded, or unpublished
 * @returns {Promise<{source: string, shops: Array, houses: object}>}
 */
export async function fetchSceneCatalog({ scene = "3bed", live = false } = {}) {
  const supabase = getSupabase();

  if (!supabase) {
    throw new Error(
      "No database configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, then restart the dev server."
    );
  }

  if (live) {
    const { data, error } = await supabase
      .from("v_live_placements")
      .select("*")
      .eq("scene_slug", scene);

    if (error) throw new Error(`Database read failed: ${error.message}`);
    if (!data?.length) {
      throw new Error(
        `The database has no live placements for scene '${scene}'. ` +
        "Apply the seed:  python supabase/apply.py --seed-only"
      );
    }
    return { ...rowsToManifest(data, scene), source: "live" };
  }

  const { data, error } = await supabase
    .from("v_current_scene")
    .select("version, published_at, payload")
    .eq("scene_slug", scene)
    .maybeSingle();

  if (error) throw new Error(`Database read failed: ${error.message}`);

  if (!data) {
    // Distinguished from an empty database on purpose. The placements may all
    // be there and simply never have been published, and the fix for that is
    // a button rather than a seed.
    throw new Error(
      `Scene '${scene}' has never been published. An administrator has to ` +
      "publish it before visitors can see it."
    );
  }

  const placements = data.payload?.placements ?? [];
  if (!placements.length) {
    throw new Error(
      `Published version ${data.version} of '${scene}' contains no placements.`
    );
  }

  return {
    ...rowsToManifest(placements, scene),
    source: `published v${data.version}`,
    version: data.version,
    publishedAt: data.published_at,
  };
}

/**
 * Freeze the current draft as a new published version.
 *
 * The database does the work and the permission check -- `publish_scene` is
 * security definer and asks for `scene.publish` itself, so a browser cannot
 * talk its way past it by calling this differently.
 */
export async function publishScene(scene = "3bed", notes = null) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("No database configured.");

  const { data, error } = await supabase.rpc("publish_scene", {
    p_slug: scene,
    p_notes: notes,
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] : data;
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
