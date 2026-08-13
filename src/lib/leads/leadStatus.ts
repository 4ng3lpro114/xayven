import "server-only";
import { saveConversation, recordLeadStatusChange } from "@/lib/db/conversationStore";
import type {
  Conversation,
  LeadStatus,
  LeadStatusChangedBy,
  LeadStatusChangeSource,
} from "@/lib/db/types";

/**
 * Fase 9C — the ONLY sanctioned way to change `conversation.leadStatus`
 * anywhere in this codebase. Every write-point (the AI chat turn, the
 * admin's manual /status endpoint, and convertConversationToClient()) goes
 * through this function — see the Fase 9C audit §B for the exhaustive list
 * of places that used to write leadStatus directly, now reduced to zero.
 *
 * Responsibilities, in order:
 *   1. No-op if the status genuinely isn't changing — never write, never
 *      log a history row for `interested -> interested`.
 *   2. Refuse `-> client` unless it's coming from the official conversion
 *      flow (`source: "lead_conversion"`) — closes the gap where the old
 *      unrestricted /status endpoint could set leadStatus="client" with
 *      clientId still null (Fase 9C audit §B/§L).
 *   3. Persist the new status.
 *   4. Best-effort record the transition in lead_status_history — a
 *      failure here is logged and surfaced via `historyRecorded: false`,
 *      but NEVER rolls back or fakes the status change itself (Fase 9C
 *      audit §I: "estado primero, historial con captura de errores").
 */

/**
 * Only ever "client_requires_conversion" — this function takes an
 * already-loaded Conversation (never an id), so it structurally can't
 * detect "not found" itself; that's each caller's own job (getConversationById()
 * + a 404, exactly as /status and convertConversationToClient() already do).
 */
export class LeadStatusChangeError extends Error {
  constructor(
    public code: "client_requires_conversion",
    message?: string
  ) {
    super(message ?? code);
    this.name = "LeadStatusChangeError";
  }
}

export interface ChangeLeadStatusInput {
  /** The caller's own up-to-date Conversation object — NOT re-fetched
   *  internally. This matters for callers (the AI chat route) that have
   *  other pending, unsaved changes on the same object (new messages,
   *  extracted fields, leadScore, aiSummary) that must NOT be clobbered by
   *  a stale re-read. Callers that only have an id should
   *  getConversationById() themselves first. */
  conversation: Conversation;
  newStatus: LeadStatus;
  changedBy: LeadStatusChangedBy;
  source: LeadStatusChangeSource;
  metadata?: Record<string, unknown>;
}

export interface ChangeLeadStatusResult {
  conversation: Conversation;
  /** False when newStatus === the conversation's current leadStatus —
   *  nothing was written, no history row exists for this call. */
  changed: boolean;
  /** Only meaningful when changed === true. False means the status WAS
   *  updated but the lead_status_history insert failed — see the error
   *  logged server-side. Never silently treated as success. */
  historyRecorded: boolean;
}

export async function changeLeadStatus(input: ChangeLeadStatusInput): Promise<ChangeLeadStatusResult> {
  const { conversation, newStatus } = input;

  if (conversation.leadStatus === newStatus) {
    return { conversation, changed: false, historyRecorded: false };
  }

  if (newStatus === "client" && input.source !== "lead_conversion") {
    throw new LeadStatusChangeError(
      "client_requires_conversion",
      "leadStatus can only become 'client' through the official lead-conversion flow (convertConversationToClient), never a generic status edit."
    );
  }

  const fromStatus = conversation.leadStatus;
  const updated = await saveConversation({ ...conversation, leadStatus: newStatus });

  let historyRecorded = false;
  try {
    await recordLeadStatusChange({
      conversationId: updated.id,
      clientId: updated.clientId,
      fromStatus,
      toStatus: newStatus,
      changedBy: input.changedBy,
      source: input.source,
      metadata: input.metadata ?? {},
    });
    historyRecorded = true;
  } catch (error) {
    // Never fake success, never let this block/roll back the status
    // change that already landed — see the module doc comment above.
    console.error("[leads] changeLeadStatus: failed to record lead_status_history:", error);
  }

  return { conversation: updated, changed: true, historyRecorded };
}
