import "server-only";
import { getConversationById, saveConversation } from "@/lib/db/conversationStore";
import { changeLeadStatus } from "@/lib/leads/leadStatus";
import {
  getClientById,
  getClientByNormalizedEmail,
  createClientOrGetExisting,
} from "@/lib/db/paymentsStore";
import type { Client } from "@/lib/payments/types";
import type { Conversation } from "@/lib/db/types";

/**
 * Lead → Client conversion (Fase 1: backend only — no UI wired up to this
 * yet, see the design authorized alongside supabase/migrations/0003_lead_to_client.sql).
 *
 * `clients` is deliberately kept narrow — only name/email/phone are ever
 * copied over. Everything the AI captured during the conversation
 * (company, website, projectType, need, goal, budget, urgency, aiSummary,
 * the full message history) stays exactly where it already lives, on the
 * conversation row, reachable forever via `conversation.clientId`. Nothing
 * here ever flattens that context onto `clients` — see the design
 * discussion this came out of for why (a client can have many
 * conversations over time; a single "current budget"/"current need"
 * column on `clients` would just get overwritten by the next inquiry).
 *
 * Fase 9B: this is also the ONE place `conversation.convertedAt` is ever
 * set — see the comment at the `saveConversation` call below.
 *
 * Fase 9C: the `leadStatus -> "client"` transition itself now goes through
 * changeLeadStatus() (the single sanctioned way to change leadStatus
 * anywhere in this codebase) with `source: "lead_conversion"` — the one
 * value that's allowed to actually reach "client". clientId/convertedAt
 * are set in a SEPARATE follow-up write, deliberately in this order (status
 * first, client link second): if the process dies between the two writes,
 * a retry re-enters this function, finds leadStatus already "client" (so
 * changeLeadStatus() no-ops — no duplicate history row) and finishes
 * linking the client — self-healing. The reverse order would NOT
 * self-heal, because the idempotent short-circuit above keys off
 * `clientId` alone. See the Fase 9C audit for the full reasoning; this is
 * an accepted, documented gap (no Postgres transaction is used, per Fase 1
 * scope) rather than a true atomic write.
 */

export type LeadConversionErrorCode =
  | "conversation_not_found"
  | "missing_email"
  | "missing_name_and_company";

export class LeadConversionError extends Error {
  constructor(
    public code: LeadConversionErrorCode,
    message?: string
  ) {
    super(message ?? code);
    this.name = "LeadConversionError";
  }
}

export interface LeadConversionResult {
  client: Client;
  conversation: Conversation;
  /** False when an existing client (already linked, or matched by
   *  normalized email) was reused instead of creating a new row. */
  clientWasCreated: boolean;
  /** True when `client.name` had to be derived from `conversation.company`
   *  because `visitorName` was missing — callers must surface this
   *  distinction rather than silently presenting it as the visitor's real
   *  name (per Fase 1 decision #5). */
  nameDerivedFromCompany: boolean;
  /**
   * Fase 9C: mirrors ChangeLeadStatusResult.historyRecorded for the
   * leadStatus -> "client" transition this call performed. False means
   * the conversion itself fully succeeded (client created/linked,
   * clientId + convertedAt persisted) but the lead_status_history row
   * failed to insert — see changeLeadStatus()'s doc comment for why that
   * never blocks or reverts the conversion. `true` on the idempotent
   * short-circuit (conversation already had a client linked): no new
   * transition is attempted on that path, so there's nothing new that
   * could have failed to record. Callers must read this rather than
   * assume every conversion left a complete audit trail — this phase
   * doesn't add alerting, just stops the information from being dropped.
   */
  historyRecorded: boolean;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Idempotent and safely retriable by design — no Postgres transaction/RPC
 * is used (deliberately, per Fase 1 scope). Every step is structured so
 * that re-running this whole function after a partial failure (e.g. the
 * client gets created but the conversation update below fails) converges
 * to the same end state instead of duplicating anything: a retry would
 * find the just-created client again via `getClientByNormalizedEmail` and
 * simply finish linking it. This is the same principle
 * `applyProviderStatus` already uses for payments — safety through
 * idempotent, re-triable steps rather than a database transaction.
 */
export async function convertConversationToClient(
  conversationId: string
): Promise<LeadConversionResult> {
  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    throw new LeadConversionError("conversation_not_found");
  }

  // Already converted — idempotent short-circuit. Never re-create or
  // re-link once a client is attached, and never touch converted_at here
  // either (Fase 9B) — this path doesn't call saveConversation() at all,
  // so a conversation's converted_at (set once, below) is never revisited
  // on a repeat call.
  if (conversation.clientId) {
    const existing = await getClientById(conversation.clientId);
    if (existing) {
      return {
        client: existing,
        conversation,
        clientWasCreated: false,
        nameDerivedFromCompany: false,
        historyRecorded: true,
      };
    }
    // client_id pointed at a client that no longer exists — shouldn't
    // happen under normal operation (ON DELETE SET NULL should have
    // cleared it), but never trust that blindly. Fall through and treat
    // this conversation as not-yet-converted rather than failing outright.
  }

  const email = conversation.visitorEmail?.trim();
  if (!email) {
    throw new LeadConversionError(
      "missing_email",
      "El lead no tiene email registrado — no se puede convertir sin uno."
    );
  }

  let name = conversation.visitorName?.trim();
  let nameDerivedFromCompany = false;
  if (!name) {
    const company = conversation.company?.trim();
    if (!company) {
      throw new LeadConversionError(
        "missing_name_and_company",
        "El lead no tiene nombre ni empresa registrados — no se puede convertir sin al menos uno de los dos."
      );
    }
    name = company;
    nameDerivedFromCompany = true;
  }

  const normalizedEmail = normalizeEmail(email);

  const existingByEmail = await getClientByNormalizedEmail(normalizedEmail);
  const { client, created } = existingByEmail
    ? { client: existingByEmail, created: false }
    : await createClientOrGetExisting({
        name,
        email,
        phone: conversation.visitorPhone,
      });

  // Known, documented consequence of the self-healing ordering above: the
  // lead_status_history row this writes has `client_id: null`, because
  // clientId isn't linked on `conversations` until the NEXT write, below.
  // The real link is never lost — it's always recoverable via
  // conversation_id -> conversations.client_id — this row just doesn't
  // denormalize it directly. Reordering to link clientId first would lose
  // the self-healing property instead (see the module doc comment).
  const statusResult = await changeLeadStatus({
    conversation,
    newStatus: "client",
    changedBy: "admin",
    source: "lead_conversion",
  });

  const updatedConversation = await saveConversation({
    ...statusResult.conversation,
    clientId: client.id,
    // Fase 9B: set exactly once, the first time this conversation really
    // converts. `conversation.convertedAt ?? ...` is the idempotency
    // guard for the one edge case that reaches this line with it already
    // set (client_id pointed at a since-deleted client — see the
    // fall-through comment above) — never overwrite a real historical
    // date with "now".
    convertedAt: conversation.convertedAt ?? new Date().toISOString(),
  });

  return {
    client,
    conversation: updatedConversation,
    clientWasCreated: created,
    nameDerivedFromCompany,
    historyRecorded: statusResult.historyRecorded,
  };
}
