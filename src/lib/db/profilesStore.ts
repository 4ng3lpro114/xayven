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

/**
 * Read-only: the set of `clients.id` values that currently have an XAYVEN
 * account linked (`profiles.client_id IS NOT NULL`) — used exclusively for
 * display (see /admin/clients' "Cuenta" column and
 * src/lib/clients/summary.ts's `hasAccount`). Never used to make any
 * security/write decision, and never a second deduplication mechanism —
 * it only reads the real `profiles.client_id` relationship that
 * linkAccountToClient() already establishes; it doesn't infer anything
 * from name/email matching.
 *
 * Uses the service role like every other admin-only bulk read in this
 * project (listClients/listProjects/listPayments in paymentsStore.ts) —
 * `profiles` has no SELECT policy for this, by design, so this is the
 * only way to read it in bulk. Fails soft (empty set) rather than
 * throwing when the service role isn't configured, matching those same
 * read functions' resilience — this is a display concern, not a
 * security boundary (that boundary is RLS on `profiles` itself,
 * untouched by this function).
 */
export async function listLinkedProfileClientIds(): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return new Set();

  const { data } = await supabase.from("profiles").select("client_id").not("client_id", "is", null);

  return new Set((data ?? []).map((row) => row.client_id as string));
}
