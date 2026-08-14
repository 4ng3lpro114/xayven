import "server-only";

/**
 * The 7 mutually-exclusive outcomes a payment webhook delivery can have —
 * see the Fase 3B audit (docs/payments.md is the code-level source of
 * truth; this file exists specifically because, before it, only the
 * rejection paths logged anything at all: a fully successful delivery and
 * an idempotent duplicate were both completely silent, making it
 * impossible to tell "processed correctly" apart from "never arrived" in
 * production logs).
 */
export type WebhookLogEvent =
  | "WEBHOOK_RECEIVED"
  | "WEBHOOK_REJECTED_SIGNATURE"
  | "WEBHOOK_IGNORED_EVENT"
  | "WEBHOOK_PAYMENT_NOT_FOUND"
  | "WEBHOOK_IDEMPOTENT_DUPLICATE"
  | "WEBHOOK_PROCESSED"
  | "WEBHOOK_INTERNAL_ERROR";

const LOG_LEVEL: Record<WebhookLogEvent, "info" | "warn" | "error"> = {
  WEBHOOK_RECEIVED: "info",
  WEBHOOK_REJECTED_SIGNATURE: "warn",
  WEBHOOK_IGNORED_EVENT: "info",
  WEBHOOK_PAYMENT_NOT_FOUND: "warn",
  WEBHOOK_IDEMPOTENT_DUPLICATE: "info",
  WEBHOOK_PROCESSED: "info",
  WEBHOOK_INTERNAL_ERROR: "error",
};

/** Only flat primitives — deliberately shaped so a caller can't pass a raw
 *  payload, header bag, or secret through by accident. Never widen this to
 *  `unknown`/`object`. */
type SafeDetail = string | number | boolean | null | undefined;

/**
 * Single, consistent log line for every distinguishable webhook outcome.
 * Never logs a full payload, header, API key, or secret — only whatever
 * safe, already-extracted identifiers the caller explicitly passes in
 * `details` (e.g. `transactionId`, `paymentId`, `status`).
 */
export function logWebhookEvent(
  event: WebhookLogEvent,
  provider: "WOMPI" | "PAYPAL",
  details?: Record<string, SafeDetail>
): void {
  const level = LOG_LEVEL[event];
  console[level](`[webhook] ${event}`, { provider, ...details });
}
