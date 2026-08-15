import "server-only";
import {
  getContactRequestById,
  linkContactRequestToClient,
} from "@/lib/db/contactRequestStore";
import { getClientById, createClientOrGetExisting, markClientAsCommercial } from "@/lib/db/paymentsStore";
import type { Client } from "@/lib/payments/types";
import type { ContactRequest } from "@/lib/db/types";

/**
 * Contact request → Client conversion ("Agregar cliente" in
 * /admin/contact-requests/[id]). Deliberately the SAME philosophy as
 * src/lib/leads/conversion.ts's convertConversationToClient() — reuses
 * createClientOrGetExisting() (same email-dedup, same real DB unique
 * constraint + 23505 recovery), same idempotent/self-healing-by-retry
 * approach instead of a Postgres transaction (still out of scope here,
 * same as that file). Not the same function, because the source shape
 * differs enough to matter:
 *   - `name` is always present on a contact request (required by
 *     contactSchema) — there's no "derive name from company" fallback to
 *     implement here, unlike the conversation flow.
 *   - `company` DOES get propagated to the new client (see
 *     0008_clients_company.sql) — conversations deliberately never
 *     flatten AI-gathered context onto `clients`; contact requests are a
 *     structured form with a real `company` field meant to travel with
 *     the person, not per-inquiry context.
 *   - There's no `phone` field on this form at all — the created client
 *     always gets `phone: null`, completable later once client editing
 *     exists (same limitation the conversation flow already has today).
 *
 * Stronger integrity guarantee than the conversation flow gets: because
 * `client_id` and `status` live on the SAME table/row here (unlike
 * conversations, where leadStatus goes through a separate
 * lead_status_history write), linkContactRequestToClient() writes both in
 * one statement — there is no window where a request can be observed as
 * "converted" without a real client_id. The only remaining failure
 * window is between creating/finding the client and that link write; if
 * the process dies there, a retry is safe: createClientOrGetExisting()
 * finds the same client again by normalized email (no duplicate), and the
 * pending link write completes. A request is NEVER marked "converted"
 * before a real client exists — the link write is always the last step.
 */

export type ContactRequestConversionErrorCode = "not_found" | "client_not_found";

export class ContactRequestConversionError extends Error {
  constructor(
    public code: ContactRequestConversionErrorCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = "ContactRequestConversionError";
  }
}

export interface ContactRequestConversionResult {
  client: Client;
  contactRequest: ContactRequest;
  /** False when an existing client (already linked, or matched by
   *  normalized email) was reused instead of creating a new row. */
  clientWasCreated: boolean;
}

export async function convertContactRequestToClient(
  contactRequestId: string
): Promise<ContactRequestConversionResult> {
  const contactRequest = await getContactRequestById(contactRequestId);
  if (!contactRequest) {
    throw new ContactRequestConversionError("not_found");
  }

  // Already converted — idempotent short-circuit. Never re-create, never
  // re-link, never touch this row again on a repeat call (no extra write,
  // no updated_at bump — see the docstring's "idempotencia" requirement).
  if (contactRequest.clientId) {
    const existing = await getClientById(contactRequest.clientId);
    if (existing) {
      return { client: existing, contactRequest, clientWasCreated: false };
    }
    // client_id pointed at a client that no longer exists — shouldn't
    // happen under normal operation (ON DELETE SET NULL should have
    // cleared it), but never trust that blindly. Surface a controlled
    // error rather than silently treating this as "not yet converted"
    // and creating a second client behind an already-"converted" status.
    throw new ContactRequestConversionError("client_not_found");
  }

  const { client: foundOrCreatedClient, created } = await createClientOrGetExisting({
    name: contactRequest.name,
    email: contactRequest.email,
    phone: null,
    company: contactRequest.company,
  });

  // Solicitud → Cliente is itself a commercial-conversion event: if the
  // client found/created here was previously account-only
  // (is_commercial=false — e.g. this person registered a XAYVEN account
  // before ever submitting this request), promote it now. Never fires on
  // the newly-created branch (createClientOrGetExisting defaults
  // isCommercial to true).
  const client = foundOrCreatedClient.isCommercial
    ? foundOrCreatedClient
    : await markClientAsCommercial(foundOrCreatedClient.id);

  const updatedContactRequest = await linkContactRequestToClient(contactRequest.id, client.id, created);

  return { client, contactRequest: updatedContactRequest, clientWasCreated: created };
}
