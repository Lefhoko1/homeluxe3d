/**
 * The admin screen's side of AI placement.
 *
 * Sends the request to app/api/admin/ai-placement with the signed-in admin's
 * session, and hands back the assistant's reply and its proposed transform.
 * Nothing is saved: the caller applies the proposal to the object in the
 * editor, and the admin saves it the ordinary way.
 */

import { getSupabase } from "../supabase/client";

/**
 * @param {object} args
 * @param {string} args.variantId              the product being placed
 * @param {string|null} [args.placementId]     its saved row, when moving something already placed
 * @param {object|null} [args.transform]       where it is in the editor now
 * @param {string} args.prompt                 what the admin asked for
 * @param {Array<{role: string, text: string}>} [args.history]  earlier turns
 * @returns {Promise<{reply: string, proposal: object|null}>}
 */
export async function askForPlacement({ variantId, placementId = null, transform = null, prompt, history = [] }) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("No database is configured.");

  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sign in again to use AI placement.");

  const response = await fetch("/api/admin/ai-placement", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ variantId, placementId, transform, prompt, history }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    throw new Error(body.error ?? `AI placement failed (${response.status}).`);
  }
  return { reply: body.reply, proposal: body.proposal ?? null };
}
