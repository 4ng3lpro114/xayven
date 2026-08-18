import { formatMoney } from "@/lib/payments/format";
import { toDisplayPrice, resolveSynchronizedDisplayPrice } from "@/lib/pricing/displayPrice";

export type ServicePriceSummaryKind = "fixed" | "from" | "quote";

export interface ServicePriceSummary {
  kind: ServicePriceSummaryKind;
  amount?: number;
  currency?: string;
  /** Identity of the underlying official price this summary was built
   *  from (International Pricing — Canonical Anchor Synchronization,
   *  approved 2026-08-18) — needed so applyDisplayCurrency() can run the
   *  same sibling-swap / canonical-anchor logic withDisplayPrice() runs
   *  for Maintenance and XAYVEN AI, instead of a plain exchange-rate
   *  conversion that could re-derive an INTERNATIONAL price from whatever
   *  currency happens to be attached right now. Always set alongside
   *  `amount`/`currency` by resolveServiceOfficialPriceSummary()
   *  (officialPricing.ts) — undefined only for `kind === "quote"`, where
   *  there's nothing to convert anyway. */
  itemSlug?: string;
  marketCode?: string;
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
 * Currency; Canonical Anchor Synchronization, Phase D+). Applies the same
 * sibling-swap / canonical-anchor logic `displayPrice.ts`'s
 * `withDisplayPrice()` applies to a full `OfficialPriceResult`, restated
 * here because `ServicePriceSummary` is a different (collapsed,
 * `kind`-carrying) shape. `kind` itself is never touched — "from"/"fixed"/
 * "quote" is a fact about the underlying official price (how many
 * packages, what price type), never about which currency it's shown in.
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

  if (summary.itemSlug && summary.marketCode) {
    const resolved = await resolveSynchronizedDisplayPrice(
      { itemSlug: summary.itemSlug, marketCode: summary.marketCode, amount: summary.amount, currency: summary.currency },
      displayCurrency
    );
    if (!resolved) return summary;
    return { ...summary, amount: resolved.amount, currency: resolved.currency };
  }

  // Defensive fallback — every real caller attaches itemSlug/marketCode
  // (see resolveServiceOfficialPriceSummary() in officialPricing.ts); this
  // only exists so a summary built without them still degrades to a plain
  // exchange-rate conversion instead of silently skipping the Canonical
  // Anchor rule.
  const converted = await toDisplayPrice({ amount: summary.amount, currency: summary.currency }, displayCurrency);
  if (!converted) return summary;
  return { kind: summary.kind, amount: converted.amount, currency: converted.currency };
}
