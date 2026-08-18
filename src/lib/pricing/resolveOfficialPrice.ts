import "server-only";
import { getPricingCatalogItemBySlug } from "@/lib/db/pricingCatalogStore";
import { getPricingMarketByCode, getPricingMarketPrice } from "@/lib/db/pricingMarketStore";
import { convertFromBase } from "@/lib/pricing/convertPrice";
import type { OfficialPriceResult } from "@/lib/pricing/market/types";

/**
 * International Pricing — Phase B/C. THE single deterministic entry point
 * for "what is the official price of item X in market Y". Every consumer
 * — Web, Admin preview, XAYVEN AI's tool result (Phase E), the future
 * Payments wrapper (Phase A §16, still untouched) — calls this, never
 * queries pricing_catalog / pricing_market_prices directly to decide what
 * price to show a visitor.
 *
 * `market` (a market CODE, e.g. "US", "CO", "OTHER") is the only
 * commercial key accepted — never `currency`. This is the exact
 * conceptual signature approved in Phase A Revision 2's "Resolver — firma
 * conceptual definitiva":
 *
 *   resolveOfficialPrice({ itemSlug, market })
 *
 * currency is only ever read OFF the resolved market/catalog item, never
 * accepted as an input.
 *
 * Phase B implemented the "market_price" tier and the "base_reference" /
 * "unavailable" fallback tiers. Phase C completes the one branch Phase B
 * deliberately stubbed: when a market has conversionAllowed=true and no
 * market_price of its own, this now calls the real, deterministic
 * conversion tier (convertPrice.ts). Conversion is never performed by, or
 * exposed to, XAYVEN AI — the model only ever receives this function's
 * finished result (Phase E). If conversion isn't CURRENTLY possible (no
 * rate recorded yet, the cached rate is stale, or the target currency has
 * no commercial rounding configured), this falls through to the market's
 * `fallback_behavior` exactly as if conversion weren't allowed at all —
 * never a partial/approximate number.
 */
export async function resolveOfficialPrice(params: { itemSlug: string; market: string }): Promise<OfficialPriceResult> {
  const { itemSlug, market: marketCode } = params;

  const unavailable = (currency: string): OfficialPriceResult => ({
    itemSlug,
    marketCode,
    currency,
    amount: null,
    priceType: null,
    billingInterval: null,
    source: "unavailable",
    effectiveAt: null,
  });

  const [catalogItem, market] = await Promise.all([
    getPricingCatalogItemBySlug(itemSlug),
    getPricingMarketByCode(marketCode),
  ]);

  // Unknown item or unknown/inactive market — never guess, never throw for
  // caller-supplied bad input. Same "invalid → a clean negative result,
  // never crashes the caller's turn" discipline as
  // resolveActivePromotion()/resolveActiveService() in
  // /api/ai/chat/route.ts. Currency falls back to the item's own base
  // currency when there's no market to speak for, since that's the only
  // currency this call has any authority to mention at all.
  if (!catalogItem) return unavailable("COP");
  if (!market || !market.isActive) return unavailable(catalogItem.currency);

  const marketPrice = await getPricingMarketPrice(catalogItem.id, market.id);
  if (marketPrice && marketPrice.isActive) {
    return {
      itemSlug,
      marketCode,
      currency: marketPrice.currency,
      amount: marketPrice.price,
      priceType: marketPrice.priceType,
      billingInterval: catalogItem.billingInterval,
      source: "market_price",
      effectiveAt: marketPrice.effectiveAt,
    };
  }

  if (market.conversionAllowed) {
    const converted = await convertFromBase(catalogItem.basePrice, market.currency);
    if (converted) {
      return {
        itemSlug,
        marketCode,
        currency: market.currency,
        amount: converted.amount,
        priceType: catalogItem.priceType,
        billingInterval: catalogItem.billingInterval,
        source: "converted",
        effectiveAt: converted.effectiveAt,
      };
    }
    // Conversion is allowed for this market but isn't currently possible
    // (no rate yet / stale rate / no rounding config for this currency) —
    // fall through to fallback_behavior below, never return a partial or
    // guessed number.
  }

  if (market.fallbackBehavior === "BASE_REFERENCE") {
    return {
      itemSlug,
      marketCode,
      currency: catalogItem.currency,
      amount: catalogItem.basePrice,
      priceType: catalogItem.priceType,
      billingInterval: catalogItem.billingInterval,
      source: "base_reference",
      effectiveAt: catalogItem.updatedAt,
    };
  }

  // fallbackBehavior === "QUOTE_ONLY"
  return unavailable(market.currency);
}
