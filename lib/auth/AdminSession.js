/**
 * Who is signed in, and what they are allowed to manage.
 *
 * WHY THIS HAD TO COME FIRST
 *
 * Admin used to be `?admin=true` in the URL, which showed the toolbar to
 * anyone who guessed it and -- more to the point -- granted nothing. Every
 * table in this database has row-level security on, and every write policy
 * resolves through `auth.uid()`:
 *
 *     create policy placements_write on placements for all
 *       using (public.can_manage_shop(shop_id));
 *
 * An anonymous browser session is not a shop member and is not a platform
 * admin, so an insert comes back "new row violates row-level security
 * policy". That is not an obstacle to route around; it is the schema working.
 * The only way to write is to actually be someone.
 *
 * TWO KINDS OF ADMIN
 *
 *   platform_admin  the operator of HomeLuxe -- every shop, every scene
 *   shop owner/manager  their own shop only, through shop_members
 *
 * The policies already tell them apart, so the same screens serve both and a
 * shop can be handed self-service later without any of this being rewritten.
 * `manageableShops` is what the UI should offer; for a platform admin that is
 * every shop, for a shop manager it is theirs.
 */

import { getSupabase } from "../supabase/client";

export class AdminSession {
  /**
   * @param {import('@supabase/supabase-js').Session|null} session
   * @param {object|null} profile   row from `profiles`
   * @param {Array} shops           shops this user may manage
   */
  constructor(session = null, profile = null, shops = []) {
    this.session = session;
    this.profile = profile;
    this.shops = shops;
  }

  get isSignedIn() {
    return Boolean(this.session?.user);
  }

  get userId() {
    return this.session?.user?.id ?? null;
  }

  get email() {
    return this.session?.user?.email ?? null;
  }

  get displayName() {
    return this.profile?.display_name ?? this.email ?? null;
  }

  get role() {
    return this.profile?.role ?? "visitor";
  }

  get isPlatformAdmin() {
    return this.role === "platform_admin";
  }

  /** Anyone who may manage at least one shop sees the admin tools. */
  get canAdminister() {
    return this.isPlatformAdmin || this.shops.length > 0;
  }

  /** Shops to offer in the "which shop is this for?" field. */
  get manageableShops() {
    return this.shops;
  }

  // -- static entry points -------------------------------------------------

  /**
   * Load the current session and everything derived from it.
   *
   * Returns an empty session rather than throwing when Supabase is not
   * configured, because the showroom must keep working with no database at
   * all -- it simply has no admin.
   */
  static async current() {
    const supabase = getSupabase();
    if (!supabase) return new AdminSession();

    const { data } = await supabase.auth.getSession();
    return AdminSession.fromSession(data?.session ?? null);
  }

  /** Build a session object from a Supabase session, loading the profile. */
  static async fromSession(session) {
    const supabase = getSupabase();
    if (!supabase || !session?.user) return new AdminSession(session);

    // The profile carries the role. It is created by the on_auth_user_created
    // trigger, so it exists for anyone who signed up after 0001 -- and 0005
    // backfilled the accounts that predate it.
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, display_name, role")
      .eq("id", session.user.id)
      .maybeSingle();

    const shops = await AdminSession.loadShops(profile);
    return new AdminSession(session, profile ?? null, shops);
  }

  /**
   * Shops the caller may manage.
   *
   * A platform admin gets all of them. Everyone else gets the ones they are
   * an owner or manager of -- and note the policies would filter this anyway,
   * so this is about showing the right options rather than about security.
   */
  static async loadShops(profile) {
    const supabase = getSupabase();
    if (!supabase || !profile) return [];

    if (profile.role === "platform_admin") {
      const { data } = await supabase
        .from("shops")
        .select("id, slug, name, currency, status")
        .order("name");
      return data ?? [];
    }

    const { data } = await supabase
      .from("shop_members")
      .select("role, shops(id, slug, name, currency, status)")
      .eq("user_id", profile.id)
      .in("role", ["owner", "manager"]);

    return (data ?? []).map((row) => row.shops).filter(Boolean);
  }

  static async signIn(email, password) {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error(
        "No database is configured, so there is nothing to sign in to. " +
        "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw new Error(friendly(error.message));
    return AdminSession.fromSession(data.session);
  }

  static async signOut() {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
    return new AdminSession();
  }

  /**
   * Subscribe to sign-in, sign-out and token refresh.
   *
   * Without this the toolbar survives a sign-out in another tab, and an
   * expired token turns every save into an unexplained permission error.
   *
   * @returns {() => void} unsubscribe
   */
  static onChange(callback) {
    const supabase = getSupabase();
    if (!supabase) return () => {};

    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      callback(await AdminSession.fromSession(session));
    });
    return () => data?.subscription?.unsubscribe();
  }
}

/** Supabase's auth errors are terse; these are the two people actually hit. */
function friendly(message = "") {
  if (/invalid login credentials/i.test(message)) {
    return "That email and password do not match an account.";
  }
  if (/email not confirmed/i.test(message)) {
    return "This account's email has not been confirmed yet.";
  }
  return message;
}

export default AdminSession;
