/**
 * Writing where things stand.
 *
 * The read side of this already exists -- `v_live_placements`, consumed by
 * lib/catalog/repository.js. This is the other direction, and it is the whole
 * point of the placement editor: dragging a sofa is an UPDATE, never a
 * re-export.
 *
 * Everything goes through `admin_place_product`, the function added in
 * migration 0005, rather than through three separate inserts from the
 * browser. Not for convenience -- for consistency. A placement's room comes
 * from its SLOT, and its position comes from its own columns, so if the
 * browser wrote them separately they could disagree: a sofa standing visibly
 * in a bedroom while the bedroom's list says it is empty and the living
 * room's list still claims it. Nothing in the 3D view would show that. Doing
 * both in one statement makes the state unreachable.
 *
 * The function is NOT security definer, so a caller's rights are checked by
 * exactly the same policies as a direct insert would be.
 */

import { getSupabase } from "../supabase/client";
import { transformOf } from "../scene/transforms";

export class PlacementService {
  constructor(client = null, { scene = "3bed" } = {}) {
    this.client = client ?? getSupabase();
    this.scene = scene;
  }

  #db() {
    if (!this.client) throw new Error("No database is configured.");
    return this.client;
  }

  /**
   * Create or move a placement.
   *
   * @param {object} args
   * @param {string} args.variantId
   * @param {object} args.transform   from `transformOf(object3D)`
   * @param {string} [args.placementId]  omit to create
   * @returns {Promise<string>} the placement id
   */
  async place({ variantId, transform, placementId = null, note = null, status = "live" }) {
    const { data, error } = await this.#db().rpc("admin_place_product", {
      p_scene_slug: this.scene,
      p_variant: variantId,
      p_x_mm: transform.x_mm,
      p_y_mm: transform.y_mm,
      p_z_mm: transform.z_mm,
      p_rotation_deg: transform.rotation_deg,
      p_scale: transform.scale,
      p_placement: placementId,
      p_note: note,
      p_status: status,
    });

    if (error) throw new Error(explain(error));
    return data;
  }

  /** Convenience: save an Object3D straight from the gizmo. */
  async saveObject(object3D, { variantId, placementId = null }) {
    return this.place({
      variantId,
      placementId,
      transform: transformOf(object3D),
    });
  }

  /**
   * Take something out of the scene.
   *
   * Deletes the placement and, if the slot was created by this tool, the slot
   * with it -- otherwise every removal leaves a phantom position behind in
   * the inventory. A hand-authored slot is kept, because that one was sold.
   */
  async remove(placementId) {
    const { error } = await this.#db().rpc("admin_remove_placement", {
      p_placement: placementId,
    });
    if (error) throw new Error(explain(error));
    return true;
  }

  /** Hide without deleting: the placement keeps its slot and its history. */
  async setStatus(placementId, status) {
    const { error } = await this.#db()
      .from("placements")
      .update({ status })
      .eq("id", placementId);
    if (error) throw new Error(explain(error));
    return true;
  }

  /** Every placement in the scene, live or not -- what the admin list shows. */
  async list() {
    const { data, error } = await this.#db()
      .from("placements")
      .select(
        "id, status, x_mm, y_mm, z_mm, rotation_deg, scale, note, " +
        "placement_slots(code, rooms(code, name)), " +
        "product_variants(id, slug, products(id, name, slug, shops(slug, name)))"
      )
      .order("created_at", { ascending: false });

    if (error) throw new Error(explain(error));
    return data ?? [];
  }
}

function explain(error) {
  const message = error?.message ?? String(error);

  // The single most likely error while dragging: a sofa scoped to living
  // rooms pushed into a bedroom. The trigger in 0002 refuses it, and the raw
  // message names the product by uuid, which tells the admin nothing.
  const scope = /is not scoped for (\w+) rooms/.exec(message);
  if (scope) {
    return (
      `This product is not scoped for ${scope[1]} rooms, so it cannot stand ` +
      `there. Move it back, or add ${scope[1]} to the product's room types.`
    );
  }

  if (/row-level security|insufficient_privilege|not yours/i.test(message)) {
    return (
      "The database refused this change. Sign in as someone who manages " +
      "this shop, or as a platform admin."
    );
  }
  if (/unknown scene/i.test(message)) {
    return "That scene is not published, or does not exist.";
  }
  if (/placements_one_live_per_slot/i.test(message)) {
    return "Something is already placed in that slot.";
  }
  return message;
}

export default PlacementService;
