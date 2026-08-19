import "server-only";

/**
 * XAYVEN CORE Phase 3.3 — same shape as src/lib/contact/log.ts's
 * logContactEvent, mirrored here because /api/maintenance had no
 * structured logging at all before this phase: only ad hoc
 * console.info/console.error calls, and — more importantly —
 * maintenanceStore.ts's own silent-fallback-to-memory branch (when a
 * configured Supabase write fails) had NO logging whatsoever. That branch
 * is the one place this event set is used outside the route itself; see
 * maintenanceStore.ts's createMaintenanceRequest().
 */
export type MaintenanceLogEvent =
  | "MAINTENANCE_RECEIVED"
  | "MAINTENANCE_PERSISTED"
  | "MAINTENANCE_PERSIST_FALLBACK"
  | "MAINTENANCE_EMAIL_SENT"
  | "MAINTENANCE_EMAIL_FAILED"
  | "MAINTENANCE_INTERNAL_ERROR";

const LOG_LEVEL: Record<MaintenanceLogEvent, "info" | "warn" | "error"> = {
  MAINTENANCE_RECEIVED: "info",
  MAINTENANCE_PERSISTED: "info",
  MAINTENANCE_PERSIST_FALLBACK: "warn",
  MAINTENANCE_EMAIL_SENT: "info",
  MAINTENANCE_EMAIL_FAILED: "warn",
  MAINTENANCE_INTERNAL_ERROR: "error",
};

/** Only flat primitives — same rule as contact/log.ts's SafeDetail, so a
 *  caller can never pass a raw payload, header bag, or secret through by
 *  accident. */
type SafeDetail = string | number | boolean | null | undefined;

export function logMaintenanceEvent(event: MaintenanceLogEvent, details?: Record<string, SafeDetail>): void {
  const level = LOG_LEVEL[event];
  console[level](`[maintenance] ${event}`, details);
}
