import type { Dictionary } from "@/lib/i18n/dictionary";
import type { PaymentStatus } from "@/lib/payments/types";

/** No client/server split needed — pure formatting, safe to import from
 *  either Server or Client Components. */
export function formatMoney(amount: number, currency: string): string {
  return `${amount.toLocaleString("es-CO")} ${currency}`;
}

export function paymentStatusLabel(dict: Dictionary["portal"], status: PaymentStatus): string {
  const map: Record<PaymentStatus, string> = {
    PENDING: dict.statusPending,
    APPROVED: dict.statusApproved,
    DECLINED: dict.statusDeclined,
    ERROR: dict.statusError,
    VOIDED: dict.statusVoided,
    REFUNDED: dict.statusRefunded,
  };
  return map[status];
}
