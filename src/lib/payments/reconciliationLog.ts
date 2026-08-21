import "server-only";

/**
 * XAYVEN CORE — Payment Reconciliation Observability phase. Same shape
 * and same safety discipline as src/lib/payments/webhookLog.ts (deliberately
 * NOT merged into that file: these events describe the return-page
 * reconciliation path — reconcileTransaction()/fetchTransactionStatus() in
 * src/lib/payments/service.ts and src/lib/payments/providers/wompi.ts — a
 * flow that never receives an actual webhook delivery, so tagging it
 * `[webhook]` would be misleading in production log searches).
 *
 * This file exists because a real production incident (the Phase 5 Wompi
 * `environment` bug) took much longer to diagnose than necessary, and
 * during that diagnosis it became clear reconcileTransaction()/
 * fetchTransactionStatus() had ZERO logging of any kind — every one of
 * their several failure branches returned `null` in complete silence. If
 * the webhook path had ALSO been broken that day, or if it ever breaks in
 * the future while a user completes the return-page flow correctly, there
 * would be no way to tell from production logs whether reconciliation
 * ran at all, what the provider said, or where exactly it stopped.
 */
export type ReconciliationLogEvent =
  | "RECONCILIATION_STARTED"
  | "PROVIDER_LOOKUP_FAILED"
  | "PROVIDER_STATUS_RECEIVED"
  | "RECONCILIATION_FAILED"
  | "RECONCILIATION_COMPLETED";

const LOG_LEVEL: Record<ReconciliationLogEvent, "info" | "warn" | "error"> = {
  RECONCILIATION_STARTED: "info",
  PROVIDER_LOOKUP_FAILED: "warn",
  PROVIDER_STATUS_RECEIVED: "info",
  RECONCILIATION_FAILED: "warn",
  RECONCILIATION_COMPLETED: "info",
};

/** Only flat primitives — same rule as webhookLog.ts's SafeDetail, so a
 *  caller can never pass a raw payload, header bag, or secret through by
 *  accident (e.g. WOMPI_PRIVATE_KEY, a full provider response body). */
type SafeDetail = string | number | boolean | null | undefined;

/**
 * Single, consistent log line for every distinguishable step/outcome of
 * the return-page reconciliation flow. Never logs a full payload,
 * header, API key, or secret — only whatever safe, already-extracted
 * identifiers the caller explicitly passes in `details` (e.g.
 * `transactionId`, `paymentId`, `httpStatus`, `reportedStatus`).
 */
export function logReconciliationEvent(
  event: ReconciliationLogEvent,
  // Matches PaymentProviderName (src/lib/payments/types.ts) exactly —
  // reconcileTransaction() is generic over all 3, even though only WOMPI
  // exercises this path today (Wise has no status API, PayPal's return
  // page reconciles via captureOrder()+applyProviderStatus() directly,
  // not through reconcileTransaction() — see return/page.tsx).
  provider: "WOMPI" | "PAYPAL" | "WISE",
  details?: Record<string, SafeDetail>
): void {
  const level = LOG_LEVEL[event];
  console[level](`[reconciliation] ${event}`, { provider, ...details });
}
