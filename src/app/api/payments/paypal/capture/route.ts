import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { getPaymentByProviderTransactionId } from "@/lib/db/paymentsStore";
import { paypalProvider } from "@/lib/payments/providers/paypal";
import { applyProviderStatus } from "@/lib/payments/service";

export const runtime = "nodejs";

const bodySchema = z.object({ orderId: z.string().trim().min(1).max(64) });

/**
 * Captures a PayPal order server-side and applies the (authoritative)
 * result through the same idempotent core the webhook uses. The only
 * client input is `orderId` — an opaque identifier that only ever
 * resolves to an amount XAYVEN itself set when the order was created
 * (see service.ts `initiateProjectPayment`); there is no way to influence
 * how much gets captured from this endpoint.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = rateLimit(`paypal-capture:ip:${ip}`, { limit: 20, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  const payment = await getPaymentByProviderTransactionId("PAYPAL", parsed.data.orderId);
  if (!payment) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const captureResult = await paypalProvider.captureOrder(parsed.data.orderId);
  if (!captureResult) {
    return NextResponse.json({ ok: false, error: "capture_failed" }, { status: 502 });
  }

  if (captureResult.currency !== payment.currency) {
    console.error("[paypal-capture] Currency mismatch — refusing to apply", {
      orderId: parsed.data.orderId,
      expected: payment.currency,
      got: captureResult.currency,
    });
    return NextResponse.json({ ok: false, error: "currency_mismatch" }, { status: 409 });
  }

  const result = await applyProviderStatus({
    provider: "PAYPAL",
    providerTransactionId: captureResult.transactionId,
    reportedStatus: captureResult.status,
    reference: payment.reference,
    rawPayload: captureResult.raw,
  });

  return NextResponse.json({
    ok: true,
    status: result?.payment.status ?? captureResult.status,
  });
}
