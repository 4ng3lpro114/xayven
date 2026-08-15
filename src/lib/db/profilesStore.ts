import "server-only";
import { getSupabaseAdmin } from "@/lib/db/supabase";

/**
 * Writes to `public.profiles` — the ONLY write path to this table in the
 * whole codebase (see src/lib/auth/supabaseServer.ts's getCurrentProfile()
 * for the read side, which is anon-key/RLS-scoped instead). Deliberately
 * narrow on purpose: updates exactly one column (`client_id`), filtered by
 * `id`, using the service role.
 *
 * `profiles` has zero UPDATE/INSERT/DELETE policies for
 * authenticated/anon by design (see 0010_profiles.sql's comment) — the
 * only way any column on this table can ever change after the
 * handle_new_user() trigger creates the row is via the service role,
 * server-side. This function is that path for `client_id`. It is never
 * called directly from a Route Handler with a caller-supplied client_id —
 * see linkAccountToClient() (src/lib/auth/accountClientLink.ts), its only
 * caller, which always derives clientId itself from a trusted lookup.
 *
 * No RLS policy is added or needed for this — service role bypasses RLS
 * by design, exactly like every other service-role write in this project
 * (paymentsStore.ts, contactRequestStore.ts).
 */
export async function setProfileClientId(userId: string, clientId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("[profiles] setProfileClientId failed: service role not configured");
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ client_id: clientId })
    .eq("id", userId)
    .select("id")
    .single();

  // Never fake a successful link: an error, or an update that matched no
  // row (data is null — e.g. userId doesn't exist), both throw. Same
  // discipline as createClient/createProject in paymentsStore.ts.
  if (error || !data) {
    throw new Error(
      `[profiles] setProfileClientId failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`
    );
  }
}
