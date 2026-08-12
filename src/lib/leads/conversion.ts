import "server-only";
import { getConversationById, saveConversation } from "@/lib/db/conversationStore";
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
  // re-link once a client is attached.
  if (conversation.clientId) {
    const existing = await getClientById(conversation.clientId);
    if (existing) {
      return {
        client: existing,
        conversation,
        clientWasCreated: false,
        nameDerivedFromCompany: false,
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

  const updatedConversation = await saveConversation({
    ...conversation,
    clientId: client.id,
    leadStatus: "client",
  });

  return {
    client,
    conversation: updatedConversation,
    clientWasCreated: created,
    nameDerivedFromCompany,
  };
}
