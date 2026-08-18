import "server-only";
import { getPricingMarketByCode } from "@/lib/db/pricingMarketStore";
import { resolveOfficialPrice } from "@/lib/pricing/resolveOfficialPrice";
import type { OfficialPriceResult } from "@/lib/pricing/market/types";

/**
 * International Pricing — Canonical Anchor Synchronization (approved
 * 2026-08-18). A "sibling group" is a set of pricing_markets that all
 * represent ONE underlying commercial price, each expressed in its own
 * explicit, independently-negotiated currency — never derived from each
 * other via exchange_rates.
 *
 * Why this can't be a single market with two currencies: pricing_markets
 * has "exactamente una moneda por mercado" as a structural rule (see
 * 0021_pricing_markets.sql's own doc comment — several markets MAY share
 * a currency with different prices, but one market never has two). And
 * why it can't be reproduced live from a single exchange rate either: the
 * approved USD/EUR ratio is NOT constant across the 8 commercial items
 * (it ranges ~1.1556–1.1644 across the approved matrix, deliberately —
 * these are negotiated commercial prices, not a proportional conversion)
 * — so EUR and USD each need their own explicit pricing_market_prices
 * row, on their own market ('EU' / 'US'), and this module is what keeps
 * switching between them from ever drifting into arbitrage.
 *
 * `canonicalCurrency` is the ONE currency a group's price is anchored to
 * for any conversion OUTSIDE the group (e.g. → COP for an INTERNATIONAL
 * visitor) — this guarantees that conversion is always derived from the
 * SAME number regardless of which of the group's currencies the visitor
 * happened to be viewing at the time (see displayPrice.ts's
 * resolveSynchronizedDisplayPrice()).
 */
export interface MarketSiblingGroup {
  codes: readonly string[];
  canonicalCurrency: string;
}

export const MARKET_SIBLING_GROUPS: readonly MarketSiblingGroup[] = [
  { codes: ["US", "EU"], canonicalCurrency: "EUR" },
];

function findGroupForMarket(marketCode: string): MarketSiblingGroup | null {
  return MARKET_SIBLING_GROUPS.find((g) => g.codes.includes(marketCode)) ?? null;
}

/** True only for a market that belongs to a sibling group — CO/OTHER (and
 *  any future standalone market) are never grouped, so they always keep
 *  today's "convert directly from my own official currency" behavior. */
export function isGroupedMarket(marketCode: string): boolean {
  return findGroupForMarket(marketCode) !== null;
}

/**
 * Resolves every ACTIVE sibling market's own official price for
 * `itemSlug`, keyed by currency — one Promise.all-batched fetch, reused
 * for both the sibling-swap check and the canonical-anchor lookup so a
 * single `withDisplayPrice()`/`applyDisplayCurrency()` call never queries
 * the group's markets more than once. Returns null when `marketCode`
 * isn't grouped at all (the common case — CO/OTHER).
 */
export async function resolveGroupMemberPrices(
  itemSlug: string,
  marketCode: string
): Promise<{ group: MarketSiblingGroup; membersByCurrency: Map<string, OfficialPriceResult> } | null> {
  const group = findGroupForMarket(marketCode);
  if (!group) return null;

  const markets = await Promise.all(group.codes.map((code) => getPricingMarketByCode(code)));
  const activeMembers = markets.filter((m): m is NonNullable<typeof m> => Boolean(m) && m!.isActive);

  const results = await Promise.all(activeMembers.map((m) => resolveOfficialPrice({ itemSlug, market: m.code })));

  const membersByCurrency = new Map<string, OfficialPriceResult>();
  for (const result of results) {
    if (result.amount !== null) membersByCurrency.set(result.currency, result);
  }

  return { group, membersByCurrency };
}
