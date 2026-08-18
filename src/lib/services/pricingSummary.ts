import { formatMoney } from "@/lib/payments/format";
import { toDisplayPrice } from "@/lib/pricing/displayPrice";

export type ServicePriceSummaryKind = "fixed" | "from" | "quote";

export interface ServicePriceSummary {
  kind: ServicePriceSummaryKind;
  amount?: number;
  currency?: string;
}

/**
 * Renders a ServicePriceSummary as visitor-facing text. `formatMoney()` is
 * reused as-is from lib/payments/format.ts (same helper the client portal
 * already uses) — never a second currency formatter. `labels` come from
 * the dictionary so the string stays localized; the number/currency
 * themselves always come from Pricing Core.
 */
export function formatServicePriceLabel(
  summary: ServicePriceSummary,
  labels: { priceFrom: string; priceQuote: string }
): string {
  if (summary.kind === "quote" || summary.amount === undefined || !summary.currency) {
    return labels.priceQuote;
  }
  const money = formatMoney(summary.amount, summary.currency);
  return summary.kind === "from" ? `${labels.priceFrom} ${money}` : money;
}

/**
 * Display-currency wiring (International Pricing Phase D — Display
 * Currency). Applies `toDisplayPrice()` to an already-resolved
 * `ServicePriceSummary` — same presentation-only conversion
 * `displayPrice.ts`'s `withDisplayPrice()` applies to a full
 * `OfficialPriceResult`, restated here because `ServicePriceSummary` is a
 * different (collapsed, `kind`-carrying) shape. `kind` itself is never
 * touched — "from"/"fixed"/"quote" is a fact about the underlying
 * official price (how many packages, what price type), never about which
 * currency it's shown in.
 *
 * Falls back to `summary` completely unchanged (never a fabricated
 * number) when there's no amount to convert (`kind === "quote"`),
 * `displayCurrency` already matches, or the conversion itself isn't
 * available (no fresh rate / no currency config) — the visitor still sees
 * the real official number, just in its own currency.
 */
export async function applyDisplayCurrency(
  summary: ServicePriceSummary,
  displayCurrency: string
): Promise<ServicePriceSummary> {
  if (summary.kind === "quote" || summary.amount === undefined || !summary.currency) return summary;
  const converted = await toDisplayPrice({ amount: summary.amount, currency: summary.currency }, displayCurrency);
  if (!converted) return summary;
  return { kind: summary.kind, amount: converted.amount, currency: converted.currency };
}
