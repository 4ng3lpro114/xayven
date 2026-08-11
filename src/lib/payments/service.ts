import "server-only";
import { getProvider } from "@/lib/payments/registry";
import { generatePaymentReference } from "@/lib/payments/reference";
import { notifyPaymentApproved, notifyPaymentDeclined } from "@/lib/payments/notify";
import {
  createPayment,
  getPendingPayment,
  getPaymentByProviderTransactionId,
  getPaymentByReference,
  getPaymentById,
  getProjectById,
  getClientById,
  setProjectPaidAmount,
  updatePayment,
  recordWebhookEventIfNew,
} from "@/lib/db/paymentsStore";
import {
  TERMINAL_PAYMENT_STATUSES,
  pendingAmount,
  type Client,
  type Payment,
  type PaymentProviderName,
  type PaymentStatus,
  type PaymentType,
  type Project,
} from "@/lib/payments/types";
import type { CheckoutResult } from "@/lib/payments/provider";
import type { Locale } from "@/lib/i18n/config";

export class PaymentAuthorizationError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "PaymentAuthorizationError";
  }
}

/**
 * The server — never the client — decides how much a given paymentType
 * costs, based only on the project's stored total/paid amounts. This is
 * the single choke point Fase 17's "never trust amount from the frontend"
 * rule depends on: nothing downstream of this function ever takes an
 * amount as input from a request body.
 */
export function computeAllowedAmount(project: Project, paymentType: PaymentType): number {
  const pending = pendingAmount(project);
  if (pending <= 0) {
    throw new PaymentAuthorizationError("project_fully_paid");
  }

  switch (paymentType) {
    case "DEPOSIT":
      if (project.paidAmount > 0) {
        throw new PaymentAuthorizationError("deposit_already_paid");
      }
      return Math.round(project.totalAmount * 0.5);

    case "BALANCE":
      if (project.paidAmount <= 0) {
        throw new PaymentAuthorizationError("no_deposit_yet");
      }
      return pending;

    case "FULL_PAYMENT":
      if (project.paidAmount > 0) {
        throw new PaymentAuthorizationError("partial_payment_exists");
      }
      return project.totalAmount;

    case "MAINTENANCE":
      throw new PaymentAuthorizationError("maintenance_requires_admin_amount");
  }
}

/**
 * Starts (or resumes) a client-facing payment attempt for a project. Always
 * called with a `project` already loaded server-side from a validated
 * portal token — see /[locale]/portal/[token]/pay/[type]/page.tsx — never
 * with client-supplied identifiers alone.
 */
export async function initiateProjectPayment(params: {
  project: Project;
  client: Client;
  paymentType: Exclude<PaymentType, "MAINTENANCE">;
  provider: PaymentProviderName;
  siteUrl: string;
  locale: Locale;
}): Promise<{ payment: Payment; checkout: CheckoutResult }> {
  const providerImpl = getProvider(params.provider);
  if (!providerImpl.isConfigured()) {
    throw new PaymentAuthorizationError("provider_not_configured");
  }

  const amount = computeAllowedAmount(params.project, params.paymentType);

  const existing = await getPendingPayment(params.project.id, params.paymentType, params.provider);
  const payment =
    existing ??
    (await createPayment({
      projectId: params.project.id,
      clientId: params.client.id,
      provider: params.provider,
      reference: generatePaymentReference(params.project.id),
      amount,
      currency: params.project.currency,
      paymentType: params.paymentType,
    }));

  const returnUrl =
    `${params.siteUrl}/${params.locale}/portal/${params.project.portalToken}/return` +
    `?paymentId=${payment.id}`;

  const checkout = await providerImpl.createCheckout({
    payment,
    project: params.project,
    client: params.client,
    returnUrl,
    locale: params.locale,
  });

  const linkedPayment = await persistProviderTransactionId(payment, checkout);
  return { payment: linkedPayment, checkout };
}

/**
 * Admin-only — creates a MAINTENANCE charge with an amount and provider the
 * admin picked (never the client). This only writes the Payment row; the
 * actual checkout (Wompi signature / PayPal order) is generated on demand
 * the moment the client opens the payment link — see
 * `buildCheckoutForExistingPayment` — so a PayPal order never sits around
 * long enough to expire before the client gets to it.
 */
export async function createMaintenanceCharge(params: {
  project: Project;
  clientId: string;
  amount: number;
  provider: PaymentProviderName;
}): Promise<Payment> {
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new PaymentAuthorizationError("invalid_amount");
  }

  return createPayment({
    projectId: params.project.id,
    clientId: params.clientId,
    provider: params.provider,
    reference: generatePaymentReference(params.project.id),
    amount: params.amount,
    currency: params.project.currency,
    paymentType: "MAINTENANCE",
  });
}

/**
 * Generates a fresh checkout artifact for a Payment row that already
 * exists (currently: admin-created MAINTENANCE charges) — used by the
 * portal's maintenance pay page so nothing is pre-generated and left to
 * possibly expire (PayPal orders in particular).
 */
export async function buildCheckoutForExistingPayment(params: {
  payment: Payment;
  project: Project;
  client: Client;
  siteUrl: string;
  locale: Locale;
}): Promise<CheckoutResult> {
  const providerImpl = getProvider(params.payment.provider);
  if (!providerImpl.isConfigured()) {
    throw new PaymentAuthorizationError("provider_not_configured");
  }

  const returnUrl =
    `${params.siteUrl}/${params.locale}/portal/${params.project.portalToken}/return` +
    `?paymentId=${params.payment.id}`;

  const checkout = await providerImpl.createCheckout({
    payment: params.payment,
    project: params.project,
    client: params.client,
    returnUrl,
    locale: params.locale,
  });

  await persistProviderTransactionId(params.payment, checkout);
  return checkout;
}

async function persistProviderTransactionId(
  payment: Payment,
  checkout: CheckoutResult
): Promise<Payment> {
  if (checkout.mode !== "redirect" || !checkout.providerTransactionId || payment.providerTransactionId) {
    return payment;
  }
  const updated = await updatePayment(payment.id, {
    providerTransactionId: checkout.providerTransactionId,
  });
  return updated ?? payment;
}

export interface ApplyStatusResult {
  payment: Payment;
  project: Project | null;
  /** False for a duplicate delivery / already-terminal payment — callers
   *  must not repeat side effects (emails, project updates) when false. */
  wasNewTransition: boolean;
}

/**
 * The single idempotent core every entry point funnels through: the Wompi
 * webhook, the Wompi/PayPal return-page reconciliation, the PayPal capture
 * route, and the admin's manual Wise confirmation. Two independent guards
 * make double-processing structurally hard, not just unlikely:
 *
 *   1. `recordWebhookEventIfNew` — a DB-unique dedup key per
 *      (provider, transactionId, status) triple rejects exact repeats.
 *   2. Once a payment reaches a TERMINAL_PAYMENT_STATUSES status, this
 *      function refuses to move it again, regardless of what triggered
 *      the call — so even a webhook AND a return-page hit racing each
 *      other can only apply the transition once.
 */
export async function applyProviderStatus(params: {
  provider: PaymentProviderName;
  providerTransactionId: string;
  reportedStatus: PaymentStatus;
  reference?: string;
  rawPayload: Record<string, unknown>;
}): Promise<ApplyStatusResult | null> {
  const { isNew } = await recordWebhookEventIfNew({
    provider: params.provider,
    providerTransactionId: params.providerTransactionId,
    status: params.reportedStatus,
    payload: params.rawPayload,
  });

  let payment = await getPaymentByProviderTransactionId(params.provider, params.providerTransactionId);
  if (!payment && params.reference) {
    payment = await getPaymentByReference(params.reference);
  }
  if (!payment) {
    console.warn("[payments] status update for unknown payment", {
      provider: params.provider,
      providerTransactionId: params.providerTransactionId,
      reference: params.reference,
    });
    return null;
  }

  if (!payment.providerTransactionId) {
    payment =
      (await updatePayment(payment.id, { providerTransactionId: params.providerTransactionId })) ??
      payment;
  }

  if (!isNew) {
    return { payment, project: null, wasNewTransition: false };
  }

  // Already terminal — never move it again, no matter what's reported now.
  if (TERMINAL_PAYMENT_STATUSES.includes(payment.status)) {
    return { payment, project: null, wasNewTransition: false };
  }

  const previousStatus = payment.status;
  payment = (await updatePayment(payment.id, { status: params.reportedStatus })) ?? payment;

  let updatedProject: Project | null = null;

  if (params.reportedStatus === "APPROVED" && previousStatus !== "APPROVED") {
    if (payment.paymentType !== "MAINTENANCE") {
      const project = await getProjectById(payment.projectId);
      if (project) {
        const newPaidAmount = Math.min(project.paidAmount + payment.amount, project.totalAmount);
        const newStatus = newPaidAmount >= project.totalAmount ? "active" : project.status;
        updatedProject = await setProjectPaidAmount(project.id, newPaidAmount, newStatus);
      }
    }

    const project = updatedProject ?? (await getProjectById(payment.projectId));
    const client = await getClientById(payment.clientId);
    if (project && client) {
      await notifyPaymentApproved(payment, project, client);
    }
  } else if (params.reportedStatus === "DECLINED" && previousStatus !== "DECLINED") {
    const project = await getProjectById(payment.projectId);
    const client = await getClientById(payment.clientId);
    if (project && client) {
      await notifyPaymentDeclined(payment, project, client);
    }
  }

  return { payment, project: updatedProject, wasNewTransition: true };
}

/**
 * Authoritative reconciliation for a provider that supports a status
 * lookup (Wompi, PayPal) — fetches from the provider's API and funnels the
 * result through the same idempotent core above. Used by return pages so
 * the UI reflects reality even if the async webhook hasn't arrived yet,
 * without ever trusting the redirect URL's own claims.
 */
export async function reconcileTransaction(
  provider: PaymentProviderName,
  transactionId: string
): Promise<ApplyStatusResult | null> {
  const providerImpl = getProvider(provider);
  const status = await providerImpl.fetchTransactionStatus(transactionId);
  if (!status) return null;

  return applyProviderStatus({
    provider,
    providerTransactionId: status.transactionId,
    reportedStatus: status.status,
    reference: status.reference,
    rawPayload: status.raw,
  });
}

/**
 * Admin-only manual confirmation for Wise transfers — reuses the same
 * idempotent core by treating the payment's own id as its "transaction
 * id" (Wise has no real one). See /admin/(protected)/payments.
 */
export async function confirmManualPayment(
  paymentId: string,
  outcome: "APPROVED" | "DECLINED"
): Promise<ApplyStatusResult | null> {
  const payment = await getPaymentById(paymentId);
  if (!payment || payment.provider !== "WISE") return null;

  return applyProviderStatus({
    provider: "WISE",
    providerTransactionId: payment.providerTransactionId ?? payment.id,
    reportedStatus: outcome,
    reference: payment.reference,
    rawPayload: { confirmedManuallyBy: "admin" },
  });
}
