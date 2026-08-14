/**
 * Supabase browser client.
 *
 * Returns null when the environment is not configured, and every caller is
 * expected to handle that. The app must keep working with no database at all:
 * the 3D scene falls back to the static catalog.json that the Blender build
 * already writes, so a missing Supabase project degrades the app to
 * "read-only showroom" rather than breaking it.
 *
 * The ANON key is safe in the browser -- it carries no privileges of its own.
 * Every table has row-level security on, so what this client can see is
 * decided by the policies in supabase/migrations, not by the key.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client = null;
let warned = false;

/** The shared client, or null if Supabase is not configured. */
export function getSupabase() {
  if (client) return client;

  if (!url || !anonKey) {
    if (!warned && typeof window !== "undefined") {
      warned = true;
      console.info(
        "[supabase] not configured - using the static catalogue. " +
        "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable the database."
      );
    }
    return null;
  }

  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
    // The 3D scene reads far more than it writes.
    db: { schema: "public" },
  });
  return client;
}

/** True when a database is available. */
export function hasSupabase() {
  return Boolean(url && anonKey);
}
