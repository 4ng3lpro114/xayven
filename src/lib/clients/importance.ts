import type { LeadStatus } from "@/lib/db/types";
import type { Project, ProjectStatus } from "@/lib/payments/types";

/**
 * Client importance classification (Fase 5C, Etapa 2) — a single,
 * centralized, easy-to-modify source of truth for "can/should this client
 * be deleted, and how much friction should that require". Used both by
 * the UI (which badge/confirmation copy to show) and, authoritatively, by
 * the DELETE /api/admin/clients/[id] route (which recomputes this from
 * live data — never trusts what the UI last rendered).
 *
 * Values match exactly the real `projects.status` enum from
 * supabase/migrations/0002_payments.sql — nothing invented:
 *   'lead' | 'proposal' | 'awaiting_payment' | 'active' | 'in_progress' |
 *   'review' | 'completed' | 'maintenance' | 'cancelled'
 */

export type ClientImportance = "normal" | "important" | "protected";

/** A project in one of these states represents real, ongoing committed
 *  work — the same condition that already makes `payments.client_id` and
 *  `projects.client_id` FKs `ON DELETE RESTRICT` at the database level
 *  (see supabase/migrations/0002_payments.sql). "completed"/"cancelled"
 *  are deliberately excluded — a finished or dropped project's money (if
 *  any) is already covered by the `hasPayments`/`paidAmount > 0` checks
 *  below, so it doesn't need to be listed here too. */
export const PROTECTED_PROJECT_STATUSES: ProjectStatus[] = [
  "active",
  "in_progress",
  "review",
  "maintenance",
];

/** A project in one of these states is a live negotiation — real
 *  commercial intent, but no money has moved yet. */
export const NEGOTIATION_PROJECT_STATUSES: ProjectStatus[] = ["proposal", "awaiting_payment"];

/** Centralized threshold — change this one line to adjust what counts as
 *  a "high" lead score for the "important" tier. */
export const IMPORTANT_LEAD_SCORE_THRESHOLD = 70;

export interface ClassifyClientImportanceInput {
  /** The lead score of the client's most relevant conversation (see
   *  summary.ts's documented "most recently updated conversation"
   *  criterion) — null if the client has no conversations at all. */
  leadScore: number | null;
  leadStatus: LeadStatus | null;
  /** Only `status` and `paidAmount` are actually read — callers (e.g. the
   *  delete route) can pass a minimal projection instead of full Project
   *  rows. */
  projects: Pick<Project, "status" | "paidAmount">[];
  hasPayments: boolean;
}

/**
 * Pure, no I/O. Order of evaluation matters: PROTECTED is checked first
 * and, once true, short-circuits — a client can never be "important" once
 * they're "protected", the stronger classification always wins.
 */
export function classifyClientImportance(input: ClassifyClientImportanceInput): ClientImportance {
  const hasPaidProject = input.projects.some((p) => p.paidAmount > 0);
  const hasProtectedProject = input.projects.some((p) => PROTECTED_PROJECT_STATUSES.includes(p.status));

  if (input.hasPayments || hasPaidProject || hasProtectedProject) {
    return "protected";
  }

  const hasHighScore = (input.leadScore ?? 0) >= IMPORTANT_LEAD_SCORE_THRESHOLD;
  const isHot = input.leadStatus === "hot";
  const hasNegotiationProject = input.projects.some((p) => NEGOTIATION_PROJECT_STATUSES.includes(p.status));

  if (hasHighScore || isHot || hasNegotiationProject) {
    return "important";
  }

  return "normal";
}
