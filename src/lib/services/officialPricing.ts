import "server-only";
import { resolveOfficialPrice } from "@/lib/pricing/resolveOfficialPrice";
import type { OfficialPriceResult } from "@/lib/pricing/market/types";
import type { ServicePriceSummary, ServicePriceSummaryKind } from "@/lib/services/pricingSummary";

/**
 * International Pricing — Phase D. Market-aware "cheapest related package
 * decides fixed vs. from vs. quote" resolver — reads its numbers from
 * resolveOfficialPrice() (async, market-aware), unlike a bare
 * PricingCatalogItem[] scan. This is now the ONLY such resolver in the
 * codebase: the old base-COP-only sync version (pricingSummary.ts's
 * former `resolveServicePriceSummary()`) was removed as dead code once
 * every visitor-facing price call site (Home, /services,
 * /services/[slug]) had migrated to this one — see the Closure Audit
 * that removed it.
 *
 * Returns the same `ServicePriceSummary` shape `formatServicePriceLabel()`
 * (pricingSummary.ts) already knows how to render — zero duplicated
 * formatting logic.
 */
export async function resolveServiceOfficialPriceSummary(
  relatedPackageSlugs: readonly string[],
  marketCode: string
): Promise<ServicePriceSummary> {
  const results = await Promise.all(
    relatedPackageSlugs.map((slug) => resolveOfficialPrice({ itemSlug: slug, market: marketCode }))
  );
  const available = results.filter((r) => r.amount !== null && r.priceType !== null);

  if (available.length === 0) return { kind: "quote" };

  const cheapest = available.reduce((min, r) => (r.amount! < min.amount! ? r : min));
  const kind: ServicePriceSummaryKind = cheapest.priceType === "FROM" || available.length > 1 ? "from" : "fixed";
  // itemSlug/marketCode identify EXACTLY which official price this summary
  // collapsed from — Canonical Anchor Synchronization (approved
  // 2026-08-18) needs them so applyDisplayCurrency() can run the same
  // sibling-swap/canonical-anchor logic withDisplayPrice() already runs
  // for Maintenance/XAYVEN AI, instead of a plain exchange-rate pivot.
  return { kind, amount: cheapest.amount!, currency: cheapest.currency, itemSlug: cheapest.itemSlug, marketCode: cheapest.marketCode };
}

/**
 * Bulk-resolves the official price of each slug for one market — used by
 * the service detail page's "related packages" price cards, which (unlike
 * the index/related-service cards above) show each package's own price
 * individually rather than a single collapsed summary. One
 * Promise.all-batched call per page render, keyed by slug for O(1)
 * lookup — never N+1 sequential resolver calls.
 */
export async function resolveOfficialPricesBySlug(
  slugs: readonly string[],
  marketCode: string
): Promise<Map<string, OfficialPriceResult>> {
  const results = await Promise.all(slugs.map((slug) => resolveOfficialPrice({ itemSlug: slug, market: marketCode })));
  return new Map(results.map((r) => [r.itemSlug, r]));
}
