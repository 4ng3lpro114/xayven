import type { Payment, Project, ProjectStatus } from "@/lib/payments/types";

/**
 * Project deletion protection classification (Fase 8B) — same shape and
 * reasoning as src/lib/clients/importance.ts: a single, centralized source
 * of truth for "can/should this project be deleted, and how much friction
 * should that require". Used both by the UI (ProjectActions.tsx) and,
 * authoritatively, by DELETE /api/admin/projects/[id]/route.ts (which
 * recomputes this from live data — never trusts what the UI last
 * rendered).
 *
 * Derived directly from the Fase 8A audit findings:
 *   - `payments.project_id -> projects.id` is `ON DELETE RESTRICT` at the
 *     database level, and it does NOT care about a payment's `status` —
 *     even a single PENDING/DECLINED/ERROR row blocks a real DELETE just
 *     as much as an APPROVED one (there is no `deletePayment()` anywhere
 *     in this codebase — payments are a permanent ledger).
 *   - No code path in the app ever sets a project's status to
 *     "in_progress"/"review"/"maintenance"/"completed"/"cancelled" today
 *     — the only automatic transition is awaiting_payment -> "active",
 *     and only once fully paid. The status-based ACTIVE_WORK_STATUSES
 *     check below is defense in depth against a future status-editing
 *     feature or a manual Supabase edit, not a case reachable today.
 */

export type ProjectImportance = "normal" | "important" | "protected";

export type ProjectProtectionReason = "has_payments" | "has_payment_attempts" | "active_work";

/** Statuses that represent committed/advanced work — protected even with
 *  zero payment rows, purely as a defensive measure (see module doc). */
const ACTIVE_WORK_STATUSES: ProjectStatus[] = [
  "active",
  "in_progress",
  "review",
  "maintenance",
  "completed",
];

/** A live negotiation — real commercial intent, no money moved yet.
 *  Deletable, but the UI should ask harder before doing it. */
const NEGOTIATION_STATUSES: ProjectStatus[] = ["proposal", "awaiting_payment"];

export interface ProjectProtectionInput {
  status: ProjectStatus;
  paidAmount: number;
  /** Only `status` is actually read from each payment — callers can pass
   *  a minimal projection instead of full Payment rows. */
  payments: Pick<Payment, "status">[];
}

/**
 * Single source of truth for BOTH "is this project protected" and "why".
 * Pure, no I/O. Precedence when multiple conditions apply: real money
 * (`has_payments`) beats a mere payment attempt (`has_payment_attempts`),
 * which beats a status-only signal (`active_work`) — the strongest,
 * most specific reason always wins, same precedence rule as
 * getClientProtectionReason().
 *
 * Returns `null` if the project is NOT protected — that's exhaustive
 * given the three checks below, so `null` here implies
 * classifyProjectImportance() will never return "protected" for this
 * same input.
 */
export function getProjectProtectionReason(
  input: ProjectProtectionInput
): ProjectProtectionReason | null {
  const hasApprovedPayment = input.payments.some((p) => p.status === "APPROVED");

  if (hasApprovedPayment || input.paidAmount > 0) {
    return "has_payments";
  }
  if (input.payments.length > 0) {
    return "has_payment_attempts";
  }
  if (ACTIVE_WORK_STATUSES.includes(input.status)) {
    return "active_work";
  }
  return null;
}

/**
 * Order of evaluation matters: PROTECTED is checked first and, once true,
 * short-circuits — a project can never be "important" once it's
 * "protected", the stronger classification always wins.
 */
export function classifyProjectImportance(input: ProjectProtectionInput): ProjectImportance {
  if (getProjectProtectionReason(input) !== null) {
    return "protected";
  }
  if (NEGOTIATION_STATUSES.includes(input.status)) {
    return "important";
  }
  // Only "lead" and "cancelled" can reach here — every other real
  // ProjectStatus is covered by ACTIVE_WORK_STATUSES or
  // NEGOTIATION_STATUSES above.
  return "normal";
}

/** Convenience helper for callers that already have a full Project row
 *  (e.g. the [id] page) and its payments, rather than assembling
 *  ProjectProtectionInput by hand. */
export function getProjectProtection(
  project: Pick<Project, "status" | "paidAmount">,
  payments: Pick<Payment, "status">[]
): { importance: ProjectImportance; reason: ProjectProtectionReason | null } {
  const input: ProjectProtectionInput = {
    status: project.status,
    paidAmount: project.paidAmount,
    payments,
  };
  return { importance: classifyProjectImportance(input), reason: getProjectProtectionReason(input) };
}
