import type { ProjectStatus } from "@/lib/payments/types";
import type { ProjectWorkStage } from "@/lib/statistics/types";

/**
 * Fase 7B — clasificación de `ProjectStatus` en 4 "etapas de trabajo" para
 * la sección Trabajos/Proyectos de Estadísticas. Esto es una capa de
 * INTERPRETACIÓN puramente para reporting — no cambia ni toca la lógica
 * de negocio real (src/lib/payments/service.ts, paymentsStore.ts siguen
 * usando ProjectStatus tal cual, sin ningún cambio).
 *
 * Los 9 valores reales de ProjectStatus (src/lib/payments/types.ts, tal
 * como están definidos en 0002_payments.sql) y el razonamiento de cada
 * clasificación:
 *
 *   - "lead"             → PENDING     (todavía ni siquiera es un trabajo aceptado)
 *   - "proposal"         → PENDING     (propuesta enviada, sin aceptar/pagar)
 *   - "awaiting_payment" → PENDING     (aceptado, pero el trabajo no ha arrancado)
 *   - "active"           → IN_PROGRESS (depósito recibido, trabajo en curso)
 *   - "in_progress"      → IN_PROGRESS (explícito)
 *   - "review"           → IN_PROGRESS (todavía no entregado/cerrado)
 *   - "completed"        → COMPLETED
 *   - "maintenance"       → IN_PROGRESS (relación activa y continua post-entrega,
 *                           no es "no iniciado" ni "cerrado" — ver nota abajo)
 *   - "cancelled"        → CANCELLED   (bucket propio, ver nota abajo)
 *
 * Nota sobre "maintenance": el enum no distingue explícitamente si un
 * proyecto en mantenimiento debe leerse como "trabajo activo" o como una
 * extensión de "completado". Se clasifica aquí como IN_PROGRESS porque
 * representa una relación de trabajo continua y en curso (no cerrada) —
 * es la lectura más defendible dado el enum actual, documentada
 * explícitamente en vez de asumida en silencio.
 *
 * Nota sobre "cancelled": NUNCA se mezcla con "pending" (inflaría el
 * backlog con trabajo que ya no va a suceder) ni con "completed". Tiene
 * su propio bucket y se excluye explícitamente de "dinero pendiente por
 * cobrar" en aggregate.ts (un proyecto cancelado no es dinero cobrable).
 */
const STAGE_BY_STATUS: Record<ProjectStatus, ProjectWorkStage> = {
  lead: "pending",
  proposal: "pending",
  awaiting_payment: "pending",
  active: "in_progress",
  in_progress: "in_progress",
  review: "in_progress",
  maintenance: "in_progress",
  completed: "completed",
  cancelled: "cancelled",
};

export function classifyProjectWorkStage(status: ProjectStatus): ProjectWorkStage {
  return STAGE_BY_STATUS[status];
}

export const PROJECT_WORK_STAGE_LABELS_ES: Record<ProjectWorkStage, string> = {
  completed: "Completados",
  in_progress: "En progreso",
  pending: "Pendientes",
  cancelled: "Cancelados",
};
