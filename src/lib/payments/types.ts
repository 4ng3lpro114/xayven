/**
 * Payments domain model. Provider-agnostic on purpose: Wompi is the only
 * implementation today, but nothing here assumes Wompi's shapes (those live
 * in src/lib/payments/providers/*).
 */

export type PaymentProviderName = "WOMPI" | "PAYPAL" | "WISE";

export type PaymentStatus =
  | "PENDING"
  | "APPROVED"
  | "DECLINED"
  | "ERROR"
  | "VOIDED"
  | "REFUNDED";

/** Statuses that will never change again — safe to treat as final. */
export const TERMINAL_PAYMENT_STATUSES: PaymentStatus[] = [
  "APPROVED",
  "DECLINED",
  "ERROR",
  "VOIDED",
  "REFUNDED",
];

export type PaymentType = "DEPOSIT" | "BALANCE" | "FULL_PAYMENT" | "MAINTENANCE";

export type ProjectStatus =
  | "lead"
  | "proposal"
  | "awaiting_payment"
  | "active"
  | "in_progress"
  | "review"
  | "completed"
  | "maintenance"
  | "cancelled";

export interface Client {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  email: string;
  phone: string | null;
}

export interface Project {
  id: string;
  createdAt: string;
  updatedAt: string;
  clientId: string;
  name: string;
  status: ProjectStatus;
  currency: string;
  totalAmount: number;
  paidAmount: number;
  /** Portal capability token — see 0002_payments.sql for the rationale. */
  portalToken: string;
}

/** `pendingAmount` is always derived, never stored — one source of truth. */
export function pendingAmount(project: Pick<Project, "totalAmount" | "paidAmount">): number {
  return Math.max(project.totalAmount - project.paidAmount, 0);
}

export interface Payment {
  id: string;
  createdAt: string;
  updatedAt: string;
  projectId: string;
  clientId: string;
  provider: PaymentProviderName;
  providerTransactionId: string | null;
  reference: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paymentType: PaymentType;
  metadata: Record<string, unknown>;
}

export interface WebhookEventRecord {
  id: string;
  receivedAt: string;
  provider: PaymentProviderName;
  providerTransactionId: string;
  status: string;
  dedupKey: string;
}
