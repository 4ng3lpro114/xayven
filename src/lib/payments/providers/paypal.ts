import "server-only";
import type {
  CheckoutRequest,
  CheckoutResult,
  PaymentProvider,
  ProviderTransactionStatus,
} from "@/lib/payments/provider";
import type { PaymentStatus } from "@/lib/payments/types";

/**
 * PayPal — Orders API v2 (Sandbox first, confirmed against
 * developer.paypal.com/docs/api/orders/v2 and the webhooks signature
 * verification reference, August 2026). Plain `fetch`, no SDK — mirrors
 * src/lib/ai/provider.ts's approach.
 *
 * Flow: createCheckout creates a PayPal Order and returns its "approve"
 * link (mode: "redirect"); the buyer approves on PayPal's site; XAYVEN
 * captures server-side (see /api/payments/paypal/capture) and only THEN
 * treats the payment as authoritative — never on the browser's return
 * alone. A webhook (transaction.updated-equivalent: CHECKOUT.ORDER.APPROVED
 * / PAYMENT.CAPTURE.COMPLETED) provides a second, async confirmation path.
 *
 * Switching SANDBOX → LIVE is just PAYPAL_ENV=production plus live
 * credentials — nothing else in this file changes.
 */

function getBaseUrl(): string {
  const env = process.env.PAYPAL_ENV === "production" ? "production" : "sandbox";
  return env === "production" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export function isPayPalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

export function isPayPalWebhookConfigured(): boolean {
  return isPayPalConfigured() && Boolean(process.env.PAYPAL_WEBHOOK_ID);
}

/**
 * PayPal's currency table (developer.paypal.com/api/rest/reference/
 * currency-codes/), verified directly against a live Sandbox order-create
 * call during development. **COP is NOT on this list** — a real Sandbox
 * request with `currency_code: "COP"` fails with `422
 * CURRENCY_NOT_SUPPORTED`, despite COP being a real, commonly-used
 * currency elsewhere in this app (Wompi, Wise). Projects that should be
 * payable via PayPal need `currency: "USD"` (or another code below) set at
 * creation time — see docs/payments.md "PayPal currency".
 */
export const PAYPAL_SUPPORTED_CURRENCIES = [
  "AUD", "BRL", "CAD", "CNY", "CZK", "DKK", "EUR", "HKD", "HUF", "ILS",
  "JPY", "MYR", "MXN", "TWD", "NZD", "NOK", "PHP", "PLN", "GBP", "RUB",
  "SGD", "SEK", "CHF", "THB", "USD",
] as const;

export function isPayPalCurrencySupported(currency: string): boolean {
  return (PAYPAL_SUPPORTED_CURRENCIES as readonly string[]).includes(currency);
}

// ---------------------------------------------------------------------------
// OAuth2 (client-credentials) — cached in-process until near expiry.
// ---------------------------------------------------------------------------

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL is not configured");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${getBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`PayPal OAuth token request failed (${res.status})`);
  }

  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cachedToken.value;
}

/** Exported so paypalWebhook.ts can reuse the same authenticated client. */
export async function paypalFetch(path: string, init: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
}

/** COP has 2 decimal places in PayPal's currency table (whole-peso amounts
 *  simply get ".00") — see docs/payments.md for the source. */
export function formatPayPalAmount(amount: number): string {
  return amount.toFixed(2);
}

function mapPayPalStatus(status: string): PaymentStatus {
  switch (status) {
    case "COMPLETED":
      return "APPROVED";
    case "VOIDED":
      return "VOIDED";
    case "DECLINED":
      return "DECLINED";
    case "CREATED":
    case "SAVED":
    case "APPROVED":
    case "PAYER_ACTION_REQUIRED":
      return "PENDING";
    default:
      return "ERROR";
  }
}

interface PayPalOrderResponse {
  id: string;
  status: string;
  purchase_units?: {
    reference_id?: string;
    amount?: { currency_code?: string; value?: string };
  }[];
  links?: { rel: string; href: string }[];
}

export class PayPalProvider implements PaymentProvider {
  readonly name = "PAYPAL" as const;

  isConfigured(): boolean {
    return isPayPalConfigured();
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    if (!this.isConfigured()) {
      throw new Error("PAYPAL is not configured");
    }
    if (!isPayPalCurrencySupported(request.payment.currency)) {
      // Defense in depth — the portal's provider picker already hides
      // PayPal for unsupported-currency projects (see pay/[type]/page.tsx),
      // but this keeps a direct/stale ?provider=PAYPAL link from reaching
      // PayPal's API with a request we already know will 422.
      throw new Error(`PAYPAL does not support currency ${request.payment.currency}`);
    }

    const res = await paypalFetch("/v2/checkout/orders", {
      method: "POST",
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: request.payment.reference,
            custom_id: request.payment.id,
            description: `XAYVEN — ${request.project.name}`.slice(0, 127),
            amount: {
              currency_code: request.payment.currency,
              value: formatPayPalAmount(request.payment.amount),
            },
          },
        ],
        application_context: {
          brand_name: "XAYVEN",
          user_action: "PAY_NOW",
          return_url: request.returnUrl,
          cancel_url: request.returnUrl,
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`PayPal create order failed (${res.status}): ${detail}`);
    }

    const order = (await res.json()) as PayPalOrderResponse;
    const approveLink = order.links?.find((l) => l.rel === "approve")?.href;
    if (!approveLink) {
      throw new Error("PayPal order response had no approve link");
    }

    return { mode: "redirect", url: approveLink, providerTransactionId: order.id };
  }

  /** Authoritative GET — used by the return page, never the browser's
   *  own claim about what happened. */
  async fetchTransactionStatus(orderId: string): Promise<ProviderTransactionStatus | null> {
    if (!this.isConfigured()) return null;

    const res = await paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      method: "GET",
    });
    if (!res.ok) return null;

    const order = (await res.json()) as PayPalOrderResponse;
    const unit = order.purchase_units?.[0];
    if (!unit?.amount) return null;

    return {
      transactionId: order.id,
      reference: unit.reference_id ?? "",
      status: mapPayPalStatus(order.status),
      amountInProviderUnits: Number(unit.amount.value ?? 0),
      currency: unit.amount.currency_code ?? "",
      raw: order as unknown as Record<string, unknown>,
    };
  }

  /**
   * Re-checks a previously created order and hands back its approve link
   * if it's still something the buyer can act on — used by service.ts to
   * avoid creating a new PayPal Order on every page render/refresh/retry.
   * Only ever takes an order id we already persisted ourselves; no
   * amount/currency involved at all, since those were fixed at
   * order-creation time and PayPal itself is the source of truth for
   * whether this specific order is still open.
   *
   * Reuses `mapPayPalStatus` — the exact same statuses this file already
   * treats as "not yet final" (CREATED/SAVED/APPROVED/
   * PAYER_ACTION_REQUIRED → our PENDING) are the only ones considered
   * resumable here, so there's a single source of truth for that
   * classification. Anything terminal (COMPLETED/VOIDED/DECLINED), not
   * found, or unreachable falls through to `null` — the caller creates a
   * fresh order instead, exactly like before this method existed.
   */
  async resumeCheckout(orderId: string): Promise<CheckoutResult | null> {
    if (!this.isConfigured()) return null;

    let res: Response;
    try {
      res = await paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
        method: "GET",
      });
    } catch {
      return null;
    }
    if (!res.ok) return null;

    const order = (await res.json()) as PayPalOrderResponse;
    if (mapPayPalStatus(order.status) !== "PENDING") return null;

    const approveLink = order.links?.find((l) => l.rel === "approve")?.href;
    if (!approveLink) return null;

    return { mode: "redirect", url: approveLink, providerTransactionId: order.id };
  }

  /**
   * Captures an approved order — the moment PayPal actually moves money.
   * Called only from the server (return page / capture route), never in
   * response to a bare client claim of success. Safe to call twice: PayPal
   * itself rejects a second capture on an already-captured order, which we
   * surface as a normal (idempotent) status fetch instead of an error.
   */
  async captureOrder(orderId: string): Promise<ProviderTransactionStatus | null> {
    if (!this.isConfigured()) return null;

    const res = await paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
    });

    if (res.status === 422) {
      // ORDER_ALREADY_CAPTURED and similar — fall back to a status read so
      // callers get a consistent, idempotent result either way.
      return this.fetchTransactionStatus(orderId);
    }
    if (!res.ok) return null;

    const order = (await res.json()) as PayPalOrderResponse;
    const unit = order.purchase_units?.[0];

    return {
      transactionId: order.id,
      reference: unit?.reference_id ?? "",
      status: mapPayPalStatus(order.status),
      amountInProviderUnits: Number(unit?.amount?.value ?? 0),
      currency: unit?.amount?.currency_code ?? "",
      raw: order as unknown as Record<string, unknown>,
    };
  }
}

export const paypalProvider = new PayPalProvider();
