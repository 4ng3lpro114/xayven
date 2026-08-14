import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import {
  parseWompiEvent,
  verifyWompiChecksum,
  verifyWompiEnvironment,
  extractWompiTransaction,
} from "@/lib/payments/providers/wompiWebhook";
import { toAmountInCents, mapWompiStatus } from "@/lib/payments/providers/wompi";
import { getPaymentByReference } from "@/lib/db/paymentsStore";
import { applyProviderStatus } from "@/lib/payments/service";
import { logWebhookEvent } from "@/lib/payments/webhookLog";

export const runtime = "nodejs";

/**
 * Wompi → `transaction.updated` events. This is the AUTHORITATIVE path for
 * marking a payment APPROVED/DECLINED/etc — never the browser's return.
 * See src/lib/payments/providers/wompiWebhook.ts for the verification
 * algorithm and its doc source.
 *
 * The whole body is wrapped in a top-level try/catch (Fase 3B) purely for
 * observability — every branch below still returns exactly the same status
 * code and JSON shape it did before; the only additions are the
 * `logWebhookEvent` calls and the outer catch, which only ever fires for a
 * genuinely unexpected exception (e.g. a database error), never for any of
 * the already-handled validation branches.
 */
export async function POST(request: NextRequest) {
  try {
    // Wompi retries on non-2xx, so keep this generous — it's protecting
    // against abuse, not against legitimate retry traffic.
    const ip = getClientIp(request);
    const limit = rateLimit(`wompi-webhook:ip:${ip}`, { limit: 120, windowMs: 60_000 });
    if (!limit.allowed) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }

    const secret = process.env.WOMPI_EVENTS_SECRET;
    if (!secret) {
      console.error("[wompi-webhook] WOMPI_EVENTS_SECRET is not configured — rejecting event");
      return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const event = parseWompiEvent(body);
    if (!event) {
      console.warn("[wompi-webhook] Rejected: payload did not match the expected event shape");
      return NextResponse.json({ ok: false, error: "invalid_structure" }, { status: 400 });
    }

    // Structurally a real Wompi event — this is the earliest point where
    // "we received a webhook attempt" is actually true, independent of
    // whether it goes on to be rejected, ignored, or processed.
    logWebhookEvent("WEBHOOK_RECEIVED", "WOMPI", { eventType: event.event });

    if (!verifyWompiChecksum(event, secret)) {
      logWebhookEvent("WEBHOOK_REJECTED_SIGNATURE", "WOMPI");
      return NextResponse.json({ ok: false, error: "invalid_checksum" }, { status: 401 });
    }

    if (!verifyWompiEnvironment(event, process.env.WOMPI_ENV ?? "sandbox")) {
      console.warn("[wompi-webhook] Rejected: environment mismatch", { got: event.environment });
      return NextResponse.json({ ok: false, error: "environment_mismatch" }, { status: 400 });
    }

    // Only `transaction.updated` carries a payment status change we act on;
    // any other event type is acknowledged so Wompi doesn't retry it forever.
    if (event.event !== "transaction.updated") {
      logWebhookEvent("WEBHOOK_IGNORED_EVENT", "WOMPI", { eventType: event.event });
      return NextResponse.json({ ok: true, ignored: true });
    }

    const transaction = extractWompiTransaction(event);
    if (!transaction) {
      console.warn("[wompi-webhook] Rejected: could not extract transaction from event.data");
      return NextResponse.json({ ok: false, error: "invalid_transaction" }, { status: 400 });
    }

    // Cross-check against what WE created before ever touching state — a
    // mismatch here means either a bug or a misrouted/tampered event, and
    // must never silently update a payment.
    const existingPayment = await getPaymentByReference(transaction.reference);
    if (existingPayment) {
      const expectedAmountInCents = toAmountInCents(existingPayment.amount);
      if (
        expectedAmountInCents !== transaction.amountInCents ||
        existingPayment.currency !== transaction.currency
      ) {
        console.error("[wompi-webhook] Amount/currency mismatch — refusing to apply", {
          reference: transaction.reference,
          expectedAmountInCents,
          gotAmountInCents: transaction.amountInCents,
          expectedCurrency: existingPayment.currency,
          gotCurrency: transaction.currency,
        });
        return NextResponse.json({ ok: false, error: "amount_mismatch" }, { status: 409 });
      }
    }

    const result = await applyProviderStatus({
      provider: "WOMPI",
      providerTransactionId: transaction.id,
      reportedStatus: mapWompiStatus(transaction.status),
      reference: transaction.reference,
      rawPayload: event as unknown as Record<string, unknown>,
    });

    if (!result) {
      // Structurally valid, verified, but no matching Payment — nothing to
      // retry into existence. Acknowledge so Wompi stops resending it.
      logWebhookEvent("WEBHOOK_PAYMENT_NOT_FOUND", "WOMPI", {
        reference: transaction.reference,
        transactionId: transaction.id,
      });
      return NextResponse.json({ ok: true, matched: false });
    }

    if (result.wasNewTransition) {
      logWebhookEvent("WEBHOOK_PROCESSED", "WOMPI", {
        transactionId: transaction.id,
        paymentId: result.payment.id,
        status: result.payment.status,
      });
    } else {
      logWebhookEvent("WEBHOOK_IDEMPOTENT_DUPLICATE", "WOMPI", {
        transactionId: transaction.id,
        paymentId: result.payment.id,
        status: result.payment.status,
      });
    }

    return NextResponse.json({ ok: true, matched: true, newTransition: result.wasNewTransition });
  } catch (error) {
    // Genuinely unexpected — every "normal" rejection/ignore/no-match path
    // above already returned before reaching here. Never leak the error's
    // own message/shape to the caller; only to our own logs.
    logWebhookEvent("WEBHOOK_INTERNAL_ERROR", "WOMPI", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
