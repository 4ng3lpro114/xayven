import "server-only";
import { paypalFetch, isPayPalWebhookConfigured } from "@/lib/payments/providers/paypal";
import type { PaymentStatus } from "@/lib/payments/types";

/**
 * PayPal webhook signature verification via the "Verify webhook signature"
 * API (confirmed against docs.paypal.ai, August 2026) — PayPal signs each
 * delivery asymmetrically, so verification is a server-to-server API call
 * rather than a local HMAC computation like Wompi's.
 *
 * The payload-shape helpers below (`extractOrderInfo`,
 * `PAYPAL_EVENT_STATUS_MAP`) are pure functions with no I/O, kept here
 * rather than in the route handler so they're directly unit-testable —
 * same split as wompiWebhook.ts / __tests__/wompiWebhook.test.ts.
 */

/** Maps the PayPal webhook event types we act on to our own PaymentStatus.
 *  Anything not listed here is acknowledged by the route but ignored (e.g.
 *  CHECKOUT.ORDER.APPROVED, which we treat as informational since capture —
 *  not approval — is what actually moves money). */
export const PAYPAL_EVENT_STATUS_MAP: Record<string, PaymentStatus> = {
  "PAYMENT.CAPTURE.COMPLETED": "APPROVED",
  "PAYMENT.CAPTURE.DENIED": "DECLINED",
  "PAYMENT.CAPTURE.DECLINED": "DECLINED",
  "PAYMENT.CAPTURE.REFUNDED": "REFUNDED",
  "CHECKOUT.ORDER.VOIDED": "VOIDED",
};

export interface ExtractedOrderInfo {
  orderId: string;
  captureId: string;
  referenceId: string | null;
}

/**
 * PayPal nests the order id differently depending on the event: capture
 * events (`PAYMENT.CAPTURE.*`) carry it at
 * `resource.supplementary_data.related_ids.order_id`, while order events
 * (`CHECKOUT.ORDER.*`) carry it directly at `resource.id`. Implemented
 * defensively per the current public docs — see docs/payments.md §4 for the
 * note on confirming this against a real Sandbox delivery.
 */
export function extractOrderInfo(resource: Record<string, unknown>): ExtractedOrderInfo | null {
  const supplementary = resource.supplementary_data as
    | { related_ids?: { order_id?: string } }
    | undefined;
  const orderId =
    supplementary?.related_ids?.order_id ?? (typeof resource.id === "string" ? resource.id : undefined);
  if (!orderId) return null;

  const captureId = typeof resource.id === "string" ? resource.id : orderId;

  const purchaseUnits = resource.purchase_units as { reference_id?: string }[] | undefined;
  const referenceId =
    (typeof resource.custom_id === "string" ? resource.custom_id : undefined) ??
    purchaseUnits?.[0]?.reference_id ??
    null;

  return { orderId, captureId, referenceId };
}

export interface PayPalWebhookHeaders {
  transmissionId: string;
  transmissionTime: string;
  certUrl: string;
  authAlgo: string;
  transmissionSig: string;
}

export function readPayPalWebhookHeaders(headers: Headers): PayPalWebhookHeaders | null {
  const transmissionId = headers.get("paypal-transmission-id");
  const transmissionTime = headers.get("paypal-transmission-time");
  const certUrl = headers.get("paypal-cert-url");
  const authAlgo = headers.get("paypal-auth-algo");
  const transmissionSig = headers.get("paypal-transmission-sig");

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return null;
  }
  return { transmissionId, transmissionTime, certUrl, authAlgo, transmissionSig };
}

export async function verifyPayPalWebhookSignature(
  headers: PayPalWebhookHeaders,
  webhookEvent: unknown
): Promise<boolean> {
  if (!isPayPalWebhookConfigured()) return false;

  const res = await paypalFetch("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: JSON.stringify({
      transmission_id: headers.transmissionId,
      transmission_time: headers.transmissionTime,
      cert_url: headers.certUrl,
      auth_algo: headers.authAlgo,
      transmission_sig: headers.transmissionSig,
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: webhookEvent,
    }),
  });

  if (!res.ok) return false;

  const body = (await res.json()) as { verification_status?: string };
  return body.verification_status === "SUCCESS";
}
