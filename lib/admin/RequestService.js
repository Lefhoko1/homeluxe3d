/**
 * The queue of work shops are paying us to do.
 *
 * THE SELF-SERVE PIPELINE IS THE HALF THAT GETS DESIGNED. A shop uploads a
 * .glb, ModelInspector measures it, register_asset records it, the validator
 * checks the units, suggest_slots says where it could stand. That is a real
 * pipeline and it is in the code.
 *
 * Most shops will never touch it. They will send photographs, a price list
 * and a phone call, and expect the bed to appear in the house -- which is
 * exactly how the Slumberland bed and the Tubod hinge were made. Work the
 * system cannot describe cannot be tracked, queued, quoted or charged for,
 * so this describes it.
 *
 * The two doors converge the moment an asset exists:
 *
 *     shop uploads a model  ->  asset -> validate -> suggest -> place
 *     shop asks for one     ->  REQUEST -> produce -> asset -> ...
 *
 * WHAT IS DELIBERATELY NOT HERE. There is no `advance(id, status)` that takes
 * any status: the legal moves are decided by a trigger in migration 0011, not
 * by whichever button happens to be on screen. This offers the moves that are
 * legal FROM WHERE THE REQUEST IS, and lets the database refuse anything
 * else -- so a request cannot go from `new` straight to `delivered` without
 * anybody having made anything.
 */

import { getSupabase } from "../supabase/client";
import { NEXT_STEPS, STATE_LABELS } from "./requestStates";

// Re-exported so a caller that already has the service does not need to know
// the constants live next door.
export { NEXT_STEPS, STATE_LABELS };

export class RequestService {
  constructor(client = null) {
    this.client = client ?? getSupabase();
  }

  #db() {
    if (!this.client) throw new Error("No database is configured.");
    return this.client;
  }

  /**
   * Everything still to do, most urgent first.
   *
   * The ordering is the view's, not this file's -- priority, then due date,
   * then age -- so every screen that shows the queue shows it in the same
   * order. Which rows come back is the policy on content_requests: a shop
   * sees its own, an operator with product.read sees all of them.
   */
  async queue({ shopId = null } = {}) {
    let query = this.#db().from("v_content_queue").select("*");
    if (shopId) query = query.eq("shop_id", shopId);
    const { data, error } = await query;
    if (error) throw new Error(explain(error));
    return data ?? [];
  }

  /** One request in full, including the brief and the reference photographs. */
  async get(id) {
    const { data, error } = await this.#db()
      .from("content_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(explain(error));
    return data;
  }

  /**
   * A shop asks for something to be made.
   *
   * Everything except the title is optional ON PURPOSE. A request that has to
   * be complete before it can be raised is a form, and a form is what the
   * phone call was instead of. Missing dimensions are what `awaiting_info`
   * is for.
   */
  async raise({
    shopId,
    title,
    brief = "",
    categoryCode = null,
    referenceUrls = [],
    quotedPriceCents = null,
    dimensions = {},
    dueOn = null,
    priority = 50,
  }) {
    if (!shopId) throw new Error("A request has to belong to a shop.");
    if (!title?.trim()) throw new Error("Say what is being asked for.");

    const { data, error } = await this.#db()
      .from("content_requests")
      .insert({
        shop_id: shopId,
        title: title.trim(),
        brief: brief.trim() || null,
        category_code: categoryCode || null,
        reference_urls: referenceUrls.filter(Boolean),
        quoted_price_cents: quotedPriceCents,
        width_mm: numberOrNull(dimensions.width),
        depth_mm: numberOrNull(dimensions.depth),
        height_mm: numberOrNull(dimensions.height),
        due_on: dueOn || null,
        priority,
      })
      .select()
      .single();

    if (error) throw new Error(explain(error));
    return data;
  }

  /**
   * Move a request along.
   *
   * `productId` is required by the database to reach `delivered`, because
   * delivery without a product is not delivery -- it is a status change. The
   * trigger raises rather than letting it through, and `explain` turns that
   * into something worth reading.
   */
  async advance(id, status, { productId = null, notes = null } = {}) {
    const patch = { status };
    if (productId) patch.product_id = productId;
    if (notes !== null) patch.notes = notes;

    const { data, error } = await this.#db()
      .from("content_requests")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(explain(error));
    return data;
  }

  /** Put someone's name on it. Null unassigns, which is what the queue is. */
  async assign(id, userId) {
    const { error } = await this.#db()
      .from("content_requests")
      .update({ assigned_to: userId })
      .eq("id", id);
    if (error) throw new Error(explain(error));
    return true;
  }

  /**
   * Where could this product go once it exists?
   *
   * The question an operator asks a hundred times a week: given a thing,
   * which FREE positions will actually take it -- right category, right kind
   * of room, and physically big enough allowing for a quarter turn. Answered
   * by the database because it is the only party that knows what is already
   * sold. See suggest_slots in migration 0011.
   */
  async whereCouldThisGo(productId, { scene = "3bed", limit = 20 } = {}) {
    const { data, error } = await this.#db().rpc("suggest_slots", {
      p_product: productId,
      p_scene: scene,
      p_limit: limit,
    });
    if (error) throw new Error(explain(error));
    return data ?? [];
  }
}

function explain(error) {
  const message = error?.message ?? String(error);
  if (/cannot be delivered without a product/i.test(message)) {
    return (
      "Nothing has been made yet. Link the product this request produced " +
      "before delivering it."
    );
  }
  if (/a request cannot go from/i.test(message)) {
    // The trigger's own wording is better than anything wrapped round it:
    // "a request cannot go from new to delivered".
    return message.replace(/^.*?(a request cannot go from)/i, "$1");
  }
  if (/row-level security/i.test(message)) {
    return "The database refused this. You do not manage this shop.";
  }
  return message;
}

const numberOrNull = (value) => {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
};

export default RequestService;
