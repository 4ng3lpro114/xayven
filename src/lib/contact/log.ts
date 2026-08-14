import "server-only";

/**
 * Same shape as src/lib/payments/webhookLog.ts's logWebhookEvent — a
 * single consistent log line per distinguishable outcome, so "processed
 * correctly" is never indistinguishable from "silently vanished" in
 * production logs (which is exactly what happened before this: a missing
 * CONTACT_EMAIL_TO caused every submission to disappear with nothing but
 * a generic console.info to show for it).
 */
export type ContactLogEvent =
  | "CONTACT_RECEIVED"
  | "CONTACT_PERSISTED"
  | "CONTACT_EMAIL_SENT"
  | "CONTACT_EMAIL_FAILED"
  | "CONTACT_INTERNAL_ERROR";

const LOG_LEVEL: Record<ContactLogEvent, "info" | "warn" | "error"> = {
  CONTACT_RECEIVED: "info",
  CONTACT_PERSISTED: "info",
  CONTACT_EMAIL_SENT: "info",
  CONTACT_EMAIL_FAILED: "warn",
  CONTACT_INTERNAL_ERROR: "error",
};

/** Only flat primitives — same rule as webhookLog.ts's SafeDetail, so a
 *  caller can never pass a raw payload, header bag, or secret through by
 *  accident (e.g. RESEND_API_KEY, or the visitor's free-text message). */
type SafeDetail = string | number | boolean | null | undefined;

export function logContactEvent(event: ContactLogEvent, details?: Record<string, SafeDetail>): void {
  const level = LOG_LEVEL[event];
  console[level](`[contact] ${event}`, details);
}
