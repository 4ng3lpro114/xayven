import "server-only";
import { getClientByNormalizedEmail, createClientOrGetExisting } from "@/lib/db/paymentsStore";
import { setProfileClientId } from "@/lib/db/profilesStore";

export interface LinkAccountToClientInput {
  userId: string;
  fullName: string;
  email: string;
}

export interface LinkAccountToClientResult {
  clientId: string;
  /** False when an existing client (matched by normalized email) was
   *  reused instead of creating a new row — same meaning as
   *  LeadConversionResult.clientWasCreated / ContactRequestConversionResult
   *  .clientWasCreated. */
  clientWasCreated: boolean;
}

/**
 * XAYVEN account <-> commercial client linking — "una cuenta cliente = un
 * cliente XAYVEN". Called once, right after a successful
 * supabase.auth.signUp() (see /api/auth/register/route.ts), when
 * `public.profiles` is guaranteed to already exist (created transactionally
 * by handle_new_user() before signUp() ever returns) with `client_id` still
 * null.
 *
 * The ONLY thing that identifies an existing client is normalized email —
 * never name, never any other field, never fuzzy. This deliberately does
 * NOT reimplement normalization or deduplication: it reuses the exact same
 * canonical primitives every other conversion flow already uses —
 * getClientByNormalizedEmail() / createClientOrGetExisting()
 * (src/lib/db/paymentsStore.ts) — the same functions
 * src/lib/leads/conversion.ts and src/lib/leads/contactRequestConversion.ts
 * call. That's what makes "Solicitud → Cliente ← Cuenta" converge on the
 * same client without any new reconciliation logic: whichever flow runs
 * second (a contact request converted after this account registered, or
 * this account registering after a contact request was already converted)
 * finds the same row via the same unique index
 * (clients_email_normalized_unique_idx, 0003_lead_to_client.sql) instead of
 * duplicating it.
 *
 * Idempotent: calling this twice for the same email converges to the same
 * clientId. createClientOrGetExisting() is race-safe (DB unique constraint
 * + 23505 recovery — never a naive check-then-insert), and calling
 * setProfileClientId() twice with the same value is a no-op in effect.
 *
 * Security: `userId`/`fullName`/`email` here always come from the just-
 * created Supabase Auth user's own server-verified data (see the caller) —
 * never from a client-suppliable `client_id`. There is no parameter on
 * this function a browser could use to point a profile at an arbitrary
 * existing client; the only lookup key is the account's own verified
 * email.
 */
export async function linkAccountToClient({
  userId,
  fullName,
  email,
}: LinkAccountToClientInput): Promise<LinkAccountToClientResult> {
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await getClientByNormalizedEmail(normalizedEmail);
  // Fase "cuenta ≠ cliente comercial" (0012_clients_is_commercial.sql):
  // a brand-new client created purely from account registration is
  // is_commercial: false — registering an account must never, by itself,
  // make someone a commercial client. An EXISTING client found by email
  // is returned untouched either way: if they were already commercial
  // (real Lead/Solicitud conversion happened first), they stay commercial;
  // if they were already account-only, they stay account-only. Never
  // upgraded or downgraded here.
  const { client, created } = existing
    ? { client: existing, created: false }
    : await createClientOrGetExisting({
        name: fullName,
        email,
        phone: null,
        company: null,
        isCommercial: false,
      });

  await setProfileClientId(userId, client.id);

  return { clientId: client.id, clientWasCreated: created };
}
