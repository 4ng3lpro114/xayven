import "server-only";
import { createHash } from "node:crypto";
import type {
  CheckoutRequest,
  CheckoutResult,
  PaymentProvider,
  ProviderTransactionStatus,
} from "@/lib/payments/provider";
import type { PaymentStatus } from "@/lib/payments/types";

/**
 * Wompi (Colombia). Integration built against the current official docs
 * (docs.wompi.co, Widget & Checkout Web + Events), confirmed August 2026:
 *
 * - Integrity signature: SHA256(reference + amountInCents + currency +
 *   [expirationTime] + integritySecret), generated server-side.
 * - Checkout: the `widget.js` script tag with `data-*` attributes
 *   (public key + reference + amount + currency + signature), same script
 *   for sandbox and production — only the keys differ per environment.
 * - Do not trust the browser's return: query
 *   GET {base}/transactions/{id} for the authoritative status.
 */

function getBaseUrl(): string {
  const env = process.env.WOMPI_ENV === "production" ? "production" : "sandbox";
  return `https://${env}.wompi.co/v1`;
}

export function isWompiConfigured(): boolean {
  return Boolean(
    process.env.WOMPI_PUBLIC_KEY &&
      process.env.WOMPI_PRIVATE_KEY &&
      process.env.WOMPI_INTEGRITY_SECRET
  );
}

/** Wompi wants an integer number of cents — COP has no fractional unit in
 *  everyday use, but we still round defensively. */
export function toAmountInCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Pure and independently testable — see
 * src/lib/payments/__tests__/wompiIntegrity.test.ts. Order matters and is
 * NOT configurable; see the file header for the doc-confirmed sequence.
 */
export function generateWompiIntegritySignature(params: {
  reference: string;
  amountInCents: number;
  currency: string;
  integritySecret: string;
  expirationTime?: string;
}): string {
  const { reference, amountInCents, currency, integritySecret, expirationTime } = params;
  const base = expirationTime
    ? `${reference}${amountInCents}${currency}${expirationTime}${integritySecret}`
    : `${reference}${amountInCents}${currency}${integritySecret}`;
  return createHash("sha256").update(base).digest("hex");
}

export function mapWompiStatus(status: string): PaymentStatus {
  switch (status) {
    case "PENDING":
    case "APPROVED":
    case "DECLINED":
    case "ERROR":
    case "VOIDED":
      return status;
    default:
      return "ERROR";
  }
}

interface WompiTransactionResponse {
  data: {
    id: string;
    status: string;
    reference: string;
    amount_in_cents: number;
    currency: string;
    [key: string]: unknown;
  };
}

export class WompiProvider implements PaymentProvider {
  readonly name = "WOMPI" as const;

  isConfigured(): boolean {
    return isWompiConfigured();
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    if (!this.isConfigured()) {
      throw new Error("WOMPI is not configured");
    }

    const publicKey = process.env.WOMPI_PUBLIC_KEY!;
    const integritySecret = process.env.WOMPI_INTEGRITY_SECRET!;
    const amountInCents = toAmountInCents(request.payment.amount);

    const signature = generateWompiIntegritySignature({
      reference: request.payment.reference,
      amountInCents,
      currency: request.payment.currency,
      integritySecret,
    });

    return {
      mode: "widget",
      // Same script, same doc-confirmed endpoint — only how we invoke it
      // changed (programmatic WidgetCheckout instead of the declarative
      // data-render="button" auto-mount). See WompiWidget.tsx for why.
      scriptSrc: "https://checkout.wompi.co/widget.js",
      config: {
        currency: request.payment.currency,
        amountInCents,
        reference: request.payment.reference,
        publicKey,
        signature: { integrity: signature },
        redirectUrl: request.returnUrl,
      },
    };
  }

  async fetchTransactionStatus(transactionId: string): Promise<ProviderTransactionStatus | null> {
    const privateKey = process.env.WOMPI_PRIVATE_KEY;
    if (!privateKey) return null;

    const res = await fetch(`${getBaseUrl()}/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${privateKey}` },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const body = (await res.json()) as WompiTransactionResponse;
    const tx = body.data;
    if (!tx?.id) return null;

    return {
      transactionId: tx.id,
      reference: tx.reference,
      status: mapWompiStatus(tx.status),
      amountInProviderUnits: tx.amount_in_cents,
      currency: tx.currency,
      raw: tx,
    };
  }
}

export const wompiProvider = new WompiProvider();
