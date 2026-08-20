/**
 * Everything a visitor does that is not looking at the house.
 *
 * Registering, following a shop, choosing what to be told about, and reading
 * what they have been told. Separate from `AdminData` on purpose: that file
 * is a tool for people who run the platform, and this one is for people who
 * came to look at a sofa. The two share a database and nothing else.
 *
 * FOLLOWING IS THE WHOLE PRODUCT HERE. A shop's news reaching somebody who
 * asked for it is the difference between a showroom and a catalogue, and it
 * is what makes a placement worth paying for -- a shop is not buying a
 * position, it is buying the people who will be told about it.
 */

import { getSupabase } from "../supabase/client";

export class VisitorService {
  constructor(client = null) {
    this.client = client ?? getSupabase();
  }

  #db() {
    if (!this.client) {
      throw new Error(
        "No database is configured, so there is nothing to sign in to."
      );
    }
    return this.client;
  }

  // -- Getting an account ------------------------------------------------

  /**
   * Create an account.
   *
   * `display_name` rides along in the user metadata, where the
   * `on_auth_user_created` trigger picks it up and puts it on the profile.
   * Setting it afterwards would mean a second round trip that can fail on its
   * own and leave somebody nameless.
   *
   * WHETHER THEY ARE SIGNED IN AFTERWARDS DEPENDS ON THE PROJECT. With email
   * confirmation on, Supabase returns a user and no session, and the honest
   * thing is to say "check your email" rather than to pretend they are in.
   */
  async register({ email, password, displayName }) {
    const clean = (email ?? "").trim().toLowerCase();
    if (!clean) throw new Error("An email address is needed.");
    if ((password ?? "").length < 8) {
      throw new Error("Use at least 8 characters, so the account is worth having.");
    }

    const { data, error } = await this.#db().auth.signUp({
      email: clean,
      password,
      options: {
        data: { display_name: (displayName ?? "").trim() || clean.split("@")[0] },
      },
    });
    if (error) throw new Error(friendly(error.message));

    return {
      user: data.user,
      session: data.session,
      // No session and a user means the project wants the address confirmed.
      needsConfirmation: Boolean(data.user) && !data.session,
    };
  }

  async signIn(email, password) {
    const { data, error } = await this.#db().auth.signInWithPassword({
      email: (email ?? "").trim().toLowerCase(),
      password,
    });
    if (error) throw new Error(friendly(error.message));
    return data.session;
  }

  async signOut() {
    await this.#db().auth.signOut();
  }

  // -- Shops, and whether you follow them --------------------------------

  /**
   * Every shop worth following, with what you have chosen for each.
   *
   * ONE QUERY, NOT TWO. Fetching shops and then follows separately means a
   * render where every Follow button is briefly wrong, which is the sort of
   * flicker that makes people click twice and unfollow what they just
   * followed.
   */
  async shops() {
    const rows = await this.#rows(
      this.#db()
        .from("shops")
        .select(`
          id, slug, name, tagline, logo_url, city, country, website,
          shop_follows(user_id, notify, notify_products, notify_posts)
        `)
        .eq("status", "active")
        .order("name"),
      "the shops"
    );

    // `shop_follows` comes back as an array because PostgREST cannot know the
    // policy already limits it to this visitor's own row.
    return rows.map((shop) => {
      const mine = (shop.shop_follows ?? [])[0] ?? null;
      return {
        id: shop.id,
        slug: shop.slug,
        name: shop.name,
        tagline: shop.tagline,
        logoUrl: shop.logo_url,
        where: [shop.city, shop.country].filter(Boolean).join(", "),
        website: shop.website,
        following: Boolean(mine),
        notify: mine?.notify ?? true,
        notifyProducts: mine?.notify_products ?? true,
        notifyPosts: mine?.notify_posts ?? true,
      };
    });
  }

  /** How many products each shop currently has standing in the house. */
  async shopCounts() {
    const rows = await this.#rows(
      this.#db().from("v_live_placements").select("shop_slug"),
      "what each shop is showing"
    );
    const counts = new Map();
    for (const row of rows) {
      counts.set(row.shop_slug, (counts.get(row.shop_slug) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * Start following, with the preferences chosen up front.
   *
   * Upsert rather than insert: pressing Follow on something you already
   * follow should be a no-op, not an error about a duplicate key.
   */
  async follow(shopId, userId, preferences = {}) {
    const { error } = await this.#db().from("shop_follows").upsert(
      {
        shop_id: shopId,
        user_id: userId,
        notify: preferences.notify ?? true,
        notify_products: preferences.notifyProducts ?? true,
        notify_posts: preferences.notifyPosts ?? true,
      },
      { onConflict: "user_id,shop_id" }
    );
    if (error) throw new Error(explain(error, "following that shop"));
    return true;
  }

  async unfollow(shopId, userId) {
    const { error } = await this.#db()
      .from("shop_follows")
      .delete()
      .eq("shop_id", shopId)
      .eq("user_id", userId);
    if (error) throw new Error(explain(error, "unfollowing that shop"));
    return true;
  }

  /** Change what you hear about without unfollowing. */
  async setPreferences(shopId, userId, preferences) {
    const { error } = await this.#db()
      .from("shop_follows")
      .update({
        notify: preferences.notify,
        notify_products: preferences.notifyProducts,
        notify_posts: preferences.notifyPosts,
      })
      .eq("shop_id", shopId)
      .eq("user_id", userId);
    if (error) throw new Error(explain(error, "your notification settings"));
    return true;
  }

  // -- What you have been told -------------------------------------------

  async notifications(limit = 50) {
    return this.#rows(
      this.#db()
        .from("notifications")
        .select("id, kind, title, body, url, read_at, created_at, shops(name, slug)")
        .order("created_at", { ascending: false })
        .limit(limit),
      "your notifications"
    );
  }

  async unreadCount() {
    const { count, error } = await this.#db()
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .is("read_at", null);
    if (error) throw new Error(explain(error, "your notifications"));
    return count ?? 0;
  }

  async markRead(ids) {
    const list = Array.isArray(ids) ? ids : [ids];
    if (!list.length) return true;
    const { error } = await this.#db()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", list);
    if (error) throw new Error(explain(error, "marking those as read"));
    return true;
  }

  async markAllRead() {
    const { error } = await this.#db()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (error) throw new Error(explain(error, "marking everything as read"));
    return true;
  }

  async #rows(query, what) {
    const { data, error } = await query;
    if (error) throw new Error(explain(error, what));
    return data ?? [];
  }
}

/**
 * Supabase's auth messages are accurate and unhelpful to somebody who is
 * trying to sign up. These say what to do instead.
 */
function friendly(message = "") {
  if (/already registered|already been registered/i.test(message)) {
    return "There is already an account with that address. Sign in instead.";
  }
  if (/invalid login credentials/i.test(message)) {
    return "That email and password do not match an account.";
  }
  if (/password should be at least/i.test(message)) {
    return "That password is too short.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Confirm your email address first — check your inbox for the link.";
  }
  if (/rate limit|too many/i.test(message)) {
    return "Too many attempts just now. Wait a minute and try again.";
  }
  return message;
}

function explain(error, what = "that") {
  const message = error?.message ?? String(error);
  if (/row-level security/i.test(message)) {
    return `You need to be signed in for ${what}.`;
  }
  if (/JWT|not authenticated/i.test(message)) {
    return "Your session has expired. Sign in again.";
  }
  return `${what[0].toUpperCase()}${what.slice(1)}: ${message}`;
}

export default VisitorService;
