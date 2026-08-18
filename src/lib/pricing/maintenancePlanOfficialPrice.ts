import "server-only";
import { getPricingCatalogItemBySlug } from "@/lib/db/pricingCatalogStore";
import { resolveOfficialPrice } from "@/lib/pricing/resolveOfficialPrice";
import { withDisplayPrice } from "@/lib/pricing/displayPrice";
import { formatMoney } from "@/lib/payments/format";
import type { Locale } from "@/lib/i18n/config";
import type { MaintenancePlanPrice } from "@/lib/pricing/maintenancePlanPrice";

/**
 * International Pricing — Phase D. Market-aware counterpart to
 * maintenancePlanPrice.ts's `resolveMaintenancePlanPrice()`. Name and
 * features are still read straight from Pricing Core (they're editorial/
 * structural facts about the plan, not market facts — a market never
 * renames Essential/Growth/Care+ or changes what's included). Only the
 * PRICE comes from resolveOfficialPrice(), market-aware. The old
 * synchronous function is untouched — this is a new, separate function,
 * not a signature change to it (same reasoning as
 * services/officialPricing.ts's doc comment).
 *
 * International Pricing Phase D — Display Currency: `displayCurrency` is
 * applied via `withDisplayPrice()` AFTER the official (market-determined)
 * price is resolved — a second, independent step, never an input to
 * `resolveOfficialPrice()` itself. Falls back to the official price
 * unchanged when conversion isn't available (see withDisplayPrice()'s doc).
 */
export async function resolveMaintenancePlanOfficialPrice(
  slug: string,
  marketCode: string,
  locale: Locale,
  labels: { perMonthSuffix: string; priceUnavailable: string },
  displayCurrency: string
): Promise<MaintenancePlanPrice> {
  const item = await getPricingCatalogItemBySlug(slug);
  if (!item || !item.isActive) {
    return { displayName: null, priceLabel: labels.priceUnavailable, features: [] };
  }

  const resolved = await resolveOfficialPrice({ itemSlug: slug, market: marketCode });
  if (resolved.amount === null) {
    return { displayName: item.name, priceLabel: labels.priceUnavailable, features: item.features[locale] };
  }

  const official = await withDisplayPrice(resolved, displayCurrency);

  return {
    displayName: item.name,
    priceLabel: `${formatMoney(official.amount!, official.currency)}${labels.perMonthSuffix}`,
    features: item.features[locale],
  };
}
