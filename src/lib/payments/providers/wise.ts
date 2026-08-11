import type {
  CheckoutRequest,
  CheckoutResult,
  PaymentProvider,
  ProviderTransactionStatus,
} from "@/lib/payments/provider";

/**
 * Wise — deliberately NOT a real payment integration. International wire
 * transfers are confirmed by a human (admin) looking at the bank account,
 * not by an API XAYVEN has access to. Modeling this honestly as
 * MANUAL_BANK_TRANSFER (per the brief) beats faking a checkout flow that
 * would silently lie to the client about what's actually confirmed.
 *
 * Flow: createCheckout returns instructions (mode: "manual") — no
 * redirect, no widget. The client wires the money outside XAYVEN entirely;
 * an admin then marks the Payment PENDING → APPROVED (or → DECLINED) by
 * hand from /admin/payments, optionally attaching a reference/proof. See
 * src/lib/payments/service.ts `confirmManualPayment`.
 */
export class WiseProvider implements PaymentProvider {
  readonly name = "WISE" as const;

  isConfigured(): boolean {
    // Always "configured" — there's no external credential to check, just
    // the instructions text, which has a safe built-in default.
    return true;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const instructions =
      process.env.WISE_TRANSFER_INSTRUCTIONS?.trim() ||
      "XAYVEN te enviará las instrucciones de transferencia internacional por correo electrónico tras confirmar tu propuesta.";

    return {
      mode: "manual",
      instructions: `${instructions}\n\nReferencia a incluir en la transferencia: ${request.payment.reference}`,
    };
  }

  async fetchTransactionStatus(): Promise<ProviderTransactionStatus | null> {
    // No API to query — status changes only happen via the admin's manual
    // confirmation (see service.ts), never an automated lookup.
    return null;
  }
}

export const wiseProvider = new WiseProvider();
