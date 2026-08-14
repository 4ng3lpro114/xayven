import type { Client, Payment, PaymentProviderName, PaymentStatus, Project } from "@/lib/payments/types";

/**
 * Everything a provider needs to start a checkout. The Payment row already
 * exists (status PENDING) by the time this is built — see
 * src/lib/payments/service.ts `initiatePayment` — so `amount`/`reference`
 * always come from something the server already decided, never from the
 * request that's about to hit the provider.
 */
export interface CheckoutRequest {
  payment: Payment;
  project: Project;
  client: Client;
  /** Absolute URL the provider should send the browser back to. */
  returnUrl: string;
  locale: "es" | "en";
}

export type CheckoutResult =
  | {
      /** Rendered as a provider-hosted widget, opened programmatically from
       *  our own button — see providers/wompi.ts and
       *  components/portal/WompiWidget.tsx. `config` is passed verbatim to
       *  the provider's own `new WidgetCheckout(config)` constructor; only
       *  Wompi uses this mode today. */
      mode: "widget";
      scriptSrc: string;
      config: {
        currency: string;
        amountInCents: number;
        reference: string;
        publicKey: string;
        signature: { integrity: string };
        redirectUrl: string;
      };
    }
  | {
      /** Browser should navigate straight to `url`. */
      mode: "redirect";
      url: string;
      /** When the provider hands back an id at checkout-creation time
       *  (e.g. PayPal's order id), the caller persists it onto the Payment
       *  immediately — see service.ts — so a later capture/webhook can
       *  find the right row without trusting anything from the client. */
      providerTransactionId?: string;
    }
  | {
      /** No online checkout — show instructions, admin confirms manually. */
      mode: "manual";
      instructions: string;
    };

export interface ProviderTransactionStatus {
  transactionId: string;
  reference: string;
  status: PaymentStatus;
  amountInProviderUnits: number;
  currency: string;
  raw: Record<string, unknown>;
}

/**
 * Common shape for every payment provider XAYVEN supports. Concrete
 * providers live in src/lib/payments/providers/*; get one via
 * src/lib/payments/registry.ts rather than importing a provider directly,
 * so call sites stay provider-agnostic.
 */
export interface PaymentProvider {
  readonly name: PaymentProviderName;

  /** False when the required env vars aren't set — callers must show an
   *  honest "not available" state, never a broken checkout. */
  isConfigured(): boolean;

  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;

  /**
   * Authoritative status lookup, independent of anything the browser
   * reports. Used by both the return page and, if needed, manual
   * reconciliation — never by the webhook path, which gets its data from
   * the (signature-verified) event body itself.
   */
  fetchTransactionStatus(transactionId: string): Promise<ProviderTransactionStatus | null>;

  /**
   * Optional: re-checks a previously created (but not yet completed)
   * checkout and hands back the same one if it's still safe to send the
   * buyer to, instead of creating a brand-new remote resource. Only
   * meaningful for providers whose `createCheckout` calls out to a remote
   * API to create something stateful (PayPal's Order) — providers like
   * Wompi (a local signature, no remote object) or Wise (no online
   * checkout at all) simply don't implement this, and callers must treat
   * its absence the same as a `null` result: fall back to `createCheckout`.
   *
   * Must never accept or derive amount/currency from anything but the
   * provider's own record of the existing transaction — this only ever
   * takes the transaction id we already persisted ourselves.
   */
  resumeCheckout?(transactionId: string): Promise<CheckoutResult | null>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: PaymentProviderName) {
    super(`${provider} is not configured`);
    this.name = "ProviderNotConfiguredError";
  }
}

export class ProviderNotImplementedError extends Error {
  constructor(provider: PaymentProviderName, feature: string) {
    super(`${provider}: ${feature} is not implemented yet`);
    this.name = "ProviderNotImplementedError";
  }
}
