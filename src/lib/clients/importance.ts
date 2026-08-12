import type { LeadStatus } from "@/lib/db/types";
import type { Project } from "@/lib/payments/types";

/**
 * Client importance classification (Fase 5C, Etapa 2) — a single,
 * centralized, easy-to-modify source of truth for "can/should this client
 * be deleted, and how much friction should that require". Used both by
 * the UI (which badge/confirmation copy to show) and, authoritatively, by
 * the DELETE /api/admin/clients/[id] route (which recomputes this from
 * live data — never trusts what the UI last rendered).
 */

export type ClientImportance = "normal" | "important" | "protected";

/** Centralized threshold — change this one line to adjust what counts as
 *  a "high" lead score for the "important" tier. */
export const IMPORTANT_LEAD_SCORE_THRESHOLD = 70;

export interface ClassifyClientImportanceInput {
  /** The lead score of the client's most relevant conversation (see
   *  summary.ts's documented "most recently updated conversation"
   *  criterion) — null if the client has no conversations at all. */
  leadScore: number | null;
  leadStatus: LeadStatus | null;
  /** Only the array's length is actually read (see the "auditoría de
   *  eliminación de proyectos" fix below) — callers can pass a minimal
   *  projection instead of full Project rows. `status`/`paidAmount` are
   *  kept in the type only because every existing caller already has
   *  them on hand. */
  projects: Pick<Project, "status" | "paidAmount">[];
  hasPayments: boolean;
}

/** Why a client is "protected" — specific enough for the UI to show a
 *  distinct message per reason (see ClientActions.tsx). `has_payments` is
 *  the stronger reason and wins when both apply. */
export type ClientProtectionReason = "has_payments" | "has_related_projects";

/**
 * Single source of truth for BOTH "is this client protected" and "why".
 * Pure, no I/O.
 *
 * Fase 5C-fix (auditoría de eliminación de proyectos, ago-2026): CUALQUIER
 * proyecto asociado protege al cliente, sin importar su `status`. Antes,
 * la protección solo dependía del status (active/in_progress/review/
 * maintenance) o de un pago real, dejando pasar clientes con un proyecto
 * en negociación (p. ej. "awaiting_payment", sin pagos) hasta un intento
 * de DELETE real — que Postgres terminaba rechazando de todas formas,
 * porque `projects.client_id -> clients.id` es `ON DELETE RESTRICT` SIN
 * excepción por status (no existe soft-delete de proyectos). El resultado
 * era un error 500 genérico en vez de un 409 explicando la causa real.
 *
 * Fase 5C-fix-2 (revisión puntual): esta razón se calculaba ANTES por
 * duplicado — una vez aquí (implícitamente, dentro de
 * classifyClientImportance) y otra vez en route.ts (`hasPayments ||
 * hasPaidProject`) para decidir qué código de error devolver. Esa
 * duplicación podía divergir si esta función cambiara sin actualizar
 * route.ts en paralelo. Ahora es una sola función: classifyClientImportance
 * y el endpoint la usan a través de esta misma fuente de verdad.
 *
 * Devuelve `null` si el cliente NO está protegido — hoy eso es exhaustivo
 * (solo hay dos causas posibles de protección), así que un `null` aquí
 * implica que classifyClientImportance() nunca devolverá "protected" para
 * este mismo input.
 */
export function getClientProtectionReason(
  input: ClassifyClientImportanceInput
): ClientProtectionReason | null {
  const hasPaidProject = input.projects.some((p) => p.paidAmount > 0);
  if (input.hasPayments || hasPaidProject) {
    return "has_payments";
  }
  if (input.projects.length > 0) {
    return "has_related_projects";
  }
  return null;
}

/**
 * Order of evaluation matters: PROTECTED is checked first and, once true,
 * short-circuits — a client can never be "important" once they're
 * "protected", the stronger classification always wins. `hasPayments` is
 * kept as an independent check inside getClientProtectionReason() (defensa
 * en profundidad), aunque en la práctica un pago siempre implica que
 * existe un proyecto asociado.
 */
export function classifyClientImportance(input: ClassifyClientImportanceInput): ClientImportance {
  if (getClientProtectionReason(input) !== null) {
    return "protected";
  }

  const hasHighScore = (input.leadScore ?? 0) >= IMPORTANT_LEAD_SCORE_THRESHOLD;
  const isHot = input.leadStatus === "hot";

  if (hasHighScore || isHot) {
    return "important";
  }

  return "normal";
}
