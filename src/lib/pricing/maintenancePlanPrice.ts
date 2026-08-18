import { formatMoney } from "@/lib/payments/format";
import type { PricingCatalogItem } from "@/lib/pricing/types";
import type { Locale } from "@/lib/i18n/config";

export interface MaintenancePlanPrice {
  /** Pricing Core's own `name` — null if the slug doesn't resolve to a
   *  real, active catalog item (caller falls back to its own editorial
   *  name in that case, see maintenance/page.tsx). */
  displayName: string | null;
  /** Already formatted with the per-month suffix, or `labels.priceUnavailable`
   *  ("Consultar"/"Get a quote") — never a fabricated number. */
  priceLabel: string;
  /** Pre-Production Correction R1 — feature bullets for the requested
   *  locale, straight from Pricing Core (never dict.maintenance.plans
   *  anymore — that was the duplicated source this correction removed).
   *  Empty array if the slug doesn't resolve — never a fabricated list. */
  features: string[];
}

/**
 * Maintenance Phase 4 — resolves ONE maintenance plan's real name/price/
 * features from Pricing Core by slug. Pulled out of maintenance/page.tsx
 * into its own pure function so it's unit-testable without rendering the
 * page, same reasoning as lib/services/pricingSummary.ts for Services.
 */
export function resolveMaintenancePlanPrice(
  slug: string,
  catalogItems: readonly PricingCatalogItem[],
  locale: Locale,
  labels: { perMonthSuffix: string; priceUnavailable: string }
): MaintenancePlanPrice {
  const item = catalogItems.find((c) => c.slug === slug && c.isActive);
  if (!item) return { displayName: null, priceLabel: labels.priceUnavailable, features: [] };
  return {
    displayName: item.name,
    priceLabel: `${formatMoney(item.basePrice, item.currency)}${labels.perMonthSuffix}`,
    features: item.features[locale],
  };
}
