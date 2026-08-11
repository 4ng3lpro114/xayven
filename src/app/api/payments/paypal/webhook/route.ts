import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import {
  readPayPalWebhookHeaders,
  verifyPayPalWebhookSignature,
  extractOrderInfo,
  PAYPAL_EVENT_STATUS_MAP,
} from "@/lib/payments/providers/paypalWebhook";
import { isPayPalWebhookConfigured } from "@/lib/payments/providers/paypal";
import { getPaymentByProviderTransactionId, getPaymentById } from "@/lib/db/paymentsStore";
import { applyProviderStatus } from "@/lib/payments/service";

export const runtime = "nodejs";

/**
 * PayPal webhooks are a secondary confirmation path here — the primary one
 * is the synchronous capture in /api/payments/paypal/capture, which already
 * gets an authoritative result directly from PayPal's response. This route
 * exists for the cases the synchronous path can miss (the browser closing
 * mid-flow, disputes, delayed captures) and is fully idempotent with it via
 * the same applyProviderStatus core, so whichever arrives first "wins" and
 * the second is a no-op.
 *
 * NOTE: exact nested field names in PayPal's webhook payloads (order id vs
 * capture id placement) are implemented defensively (see
 * providers/paypalWebhook.ts#extractOrderInfo and its unit tests) but
 * should still be confirmed against a real Sandbox delivery the first time
 * one actually arrives — see docs/payments.md §4/§13.
 */

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = rateLimit(`paypal-webhook:ip:${ip}`, { limit: 120, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  if (!isPayPalWebhookConfigured()) {
    console.error("[paypal-webhook] PAYPAL_WEBHOOK_ID is not configured — rejecting event");
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const headers = readPayPalWebhookHeaders(request.headers);
  if (!headers) {
    return NextResponse.json({ ok: false, error: "missing_signature_headers" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const verified = await verifyPayPalWebhookSignature(headers, body);
  if (!verified) {
    console.warn("[paypal-webhook] Rejected: signature verification failed");
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  const eventType = typeof body.event_type === "string" ? body.event_type : "";
  const status = PAYPAL_EVENT_STATUS_MAP[eventType];
  if (!status) {
    // Acknowledged but not acted on — e.g. CHECKOUT.ORDER.APPROVED, which
    // we treat as informational since capture (not approval) is what
    // actually moves money.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const resource = body.resource as Record<string, unknown> | undefined;
  const info = resource ? extractOrderInfo(resource) : null;
  if (!info) {
    console.warn("[paypal-webhook] Could not extract order info from event", { eventType });
    return NextResponse.json({ ok: false, error: "invalid_resource" }, { status: 400 });
  }

  const payment =
    (await getPaymentByProviderTransactionId("PAYPAL", info.orderId)) ??
    (info.referenceId ? await getPaymentById(info.referenceId) : null);

  if (!payment) {
    console.warn("[paypal-webhook] No matching payment found", info);
    return NextResponse.json({ ok: true, matched: false });
  }

  const result = await applyProviderStatus({
    provider: "PAYPAL",
    providerTransactionId: info.orderId,
    reportedStatus: status,
    reference: payment.reference,
    rawPayload: body,
  });

  return NextResponse.json({ ok: true, matched: true, newTransition: result?.wasNewTransition ?? false });
}
