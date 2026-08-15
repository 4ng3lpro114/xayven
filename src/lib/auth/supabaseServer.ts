import "server-only";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Client accounts (Supabase Auth) — completely separate from admin auth.
 * See src/lib/auth/admin.ts for the admin side (its own cookie, its own
 * secret, its own verify function); nothing here touches it.
 *
 * Uses the ANON key (never the service role) — this is deliberate: the
 * whole point of Supabase Auth + RLS is that access is scoped to the
 * signed-in user's own JWT (auth.uid()), enforced by Postgres itself (see
 * 0010_profiles.sql's policies), not by trusting application code alone.
 * getSupabaseAdmin() (service role, src/lib/db/supabase.ts) stays exactly
 * as it is, used only where the codebase already used it — never for
 * client-facing auth operations.
 *
 * Official @supabase/ssr pattern for Next.js App Router: `setAll` is
 * wrapped in try/catch because a Server Component's cookie store is
 * read-only (mutating it throws) — Route Handlers (register/login/logout
 * below) CAN write cookies, so sessions are correctly created/cleared
 * there. A Server Component using this client can still read/validate
 * the current session; it just can't persist a refreshed token by
 * itself. Known, disclosed limitation of not having a middleware.ts yet
 * (this project has none today, admin included) — see the Fase 2 report
 * for why that's an intentional, minimal-scope choice, not an oversight.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "[auth] Supabase client auth not configured — SUPABASE_URL / SUPABASE_ANON_KEY missing."
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render, where the cookie
          // store is read-only — expected, not an error. The session is
          // still correctly read; it just isn't refreshed-and-persisted
          // from here. See the module doc comment above.
        }
      },
    },
  });
}

export function isClientAuthConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

/** Returns the currently authenticated user, or null — always re-validates
 *  against Supabase Auth (never trusts a locally-decoded JWT alone). */
export async function getSessionUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export interface CurrentProfile {
  id: string;
  fullName: string;
  clientId: string | null;
  role: "admin" | "staff" | "client";
}

/**
 * Reads the signed-in user's own profile row — via the RLS-scoped client
 * (not the service role), so this can structurally never return anyone
 * else's row: `profiles_select_own` only ever matches `auth.uid() = id`.
 * Returns null if there's no session, or (defensively) if the row
 * somehow doesn't exist yet (e.g. the instant between auth.users insert
 * and the trigger completing).
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, client_id, role")
    .eq("id", user.id)
    .single();

  if (!data) return null;
  return { id: data.id, fullName: data.full_name, clientId: data.client_id, role: data.role };
}
