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

export const runtime = "nodejs";

/**
 * Wompi → `transaction.updated` events. This is the AUTHORITATIVE path for
 * marking a payment APPROVED/DECLINED/etc — never the browser's return.
 * See src/lib/payments/providers/wompiWebhook.ts for the verification
 * algorithm and its doc source.
 */
export async function POST(request: NextRequest) {
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

  if (!verifyWompiChecksum(event, secret)) {
    console.warn("[wompi-webhook] Rejected: checksum verification failed");
    return NextResponse.json({ ok: false, error: "invalid_checksum" }, { status: 401 });
  }

  if (!verifyWompiEnvironment(event, process.env.WOMPI_ENV ?? "sandbox")) {
    console.warn("[wompi-webhook] Rejected: environment mismatch", { got: event.environment });
    return NextResponse.json({ ok: false, error: "environment_mismatch" }, { status: 400 });
  }

  // Only `transaction.updated` carries a payment status change we act on;
  // any other event type is acknowledged so Wompi doesn't retry it forever.
  if (event.event !== "transaction.updated") {
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
    console.warn("[wompi-webhook] No matching payment found", {
      reference: transaction.reference,
      transactionId: transaction.id,
    });
    return NextResponse.json({ ok: true, matched: false });
  }

  return NextResponse.json({ ok: true, matched: true, newTransition: result.wasNewTransition });
}
