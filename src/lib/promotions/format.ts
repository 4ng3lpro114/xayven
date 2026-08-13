import { formatMoney } from "@/lib/payments/format";
import type { Promotion } from "@/lib/promotions/types";

/** Admin-facing structured summary only — never the visitor-facing copy
 *  (that's always `promotion.text`, hand-written, see the module doc
 *  comment on Promotion.text). Used for the admin list/detail pages so
 *  the admin can scan discount type/value at a glance without reading
 *  the full text. */
export function formatPromotionDiscount(
  promotion: Pick<Promotion, "discountType" | "discountValue" | "currency">
): string {
  if (promotion.discountType === "percentage") {
    return `${promotion.discountValue}%`;
  }
  if (promotion.discountType === "fixed_amount") {
    return `-${formatMoney(promotion.discountValue, promotion.currency ?? "")}`;
  }
  // special_price
  return `Desde ${formatMoney(promotion.discountValue, promotion.currency ?? "")}`;
}
