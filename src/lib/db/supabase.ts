import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null | undefined;

/**
 * Server-only Supabase client using the service role key — this must never
 * be imported from a Client Component (the `server-only` import throws a
 * build-time error if it is). Returns `null` when SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY aren't set, so callers can fall back to the
 * in-memory store instead of crashing the app.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export function isDatabaseConfigured(): boolean {
  return getSupabaseAdmin() !== null;
}
