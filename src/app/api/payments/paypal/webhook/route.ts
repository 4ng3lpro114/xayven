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
import { logWebhookEvent } from "@/lib/payments/webhookLog";

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
 *
 * The whole body is wrapped in a top-level try/catch (Fase 3B) purely for
 * observability — every branch below still returns exactly the same status
 * code and JSON shape it did before; the only additions are the
 * `logWebhookEvent` calls and the outer catch, which only ever fires for a
 * genuinely unexpected exception, never for any already-handled branch.
 */
export async function POST(request: NextRequest) {
  try {
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

    // Well-formed request, signature headers present — this is the
    // earliest point where "we received a webhook attempt" is actually
    // true, independent of whether it goes on to be rejected/ignored.
    logWebhookEvent("WEBHOOK_RECEIVED", "PAYPAL", {
      eventType: typeof body.event_type === "string" ? body.event_type : undefined,
    });

    const verified = await verifyPayPalWebhookSignature(headers, body);
    if (!verified) {
      logWebhookEvent("WEBHOOK_REJECTED_SIGNATURE", "PAYPAL");
      return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
    }

    const eventType = typeof body.event_type === "string" ? body.event_type : "";
    const status = PAYPAL_EVENT_STATUS_MAP[eventType];
    if (!status) {
      // Acknowledged but not acted on — e.g. CHECKOUT.ORDER.APPROVED, which
      // we treat as informational since capture (not approval) is what
      // actually moves money.
      logWebhookEvent("WEBHOOK_IGNORED_EVENT", "PAYPAL", { eventType });
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
      logWebhookEvent("WEBHOOK_PAYMENT_NOT_FOUND", "PAYPAL", { orderId: info.orderId });
      return NextResponse.json({ ok: true, matched: false });
    }

    const result = await applyProviderStatus({
      provider: "PAYPAL",
      providerTransactionId: info.orderId,
      reportedStatus: status,
      reference: payment.reference,
      rawPayload: body,
    });

    if (!result) {
      logWebhookEvent("WEBHOOK_PAYMENT_NOT_FOUND", "PAYPAL", { orderId: info.orderId });
    } else if (result.wasNewTransition) {
      logWebhookEvent("WEBHOOK_PROCESSED", "PAYPAL", {
        orderId: info.orderId,
        paymentId: result.payment.id,
        status: result.payment.status,
      });
    } else {
      logWebhookEvent("WEBHOOK_IDEMPOTENT_DUPLICATE", "PAYPAL", {
        orderId: info.orderId,
        paymentId: result.payment.id,
        status: result.payment.status,
      });
    }

    return NextResponse.json({ ok: true, matched: true, newTransition: result?.wasNewTransition ?? false });
  } catch (error) {
    logWebhookEvent("WEBHOOK_INTERNAL_ERROR", "PAYPAL", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
