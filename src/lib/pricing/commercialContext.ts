import "server-only";
import { cookies, headers } from "next/headers";
import { getPricingMarketByCode, getMarketForCountry } from "@/lib/db/pricingMarketStore";
import { DEFAULT_FALLBACK_MARKET_CODE, HARDCODED_FALLBACK_MARKET } from "@/lib/pricing/market/types";
import type { PricingMarket } from "@/lib/pricing/market/types";

/**
 * International Pricing — Phase D. THE single place a visitor's
 * COMMERCIAL MARKET gets resolved for a request, and (separately) where
 * their DISPLAY CURRENCY gets resolved. These are two independent
 * concepts, read from two independent cookies, resolved by two
 * independent functions — never conflated, per the Phase D commercial
 * requirement:
 *
 *   "Cambiar la moneda de visualización NO debe permitir obtener el
 *    precio de otro mercado."
 *
 * commercialMarket decides WHICH price is official (via
 * resolveOfficialPrice.ts). displayCurrency only decides how an
 * ALREADY-RESOLVED official price gets presented (via displayPrice.ts) —
 * it is never consulted by, or passed into, resolveOfficialPrice().
 */

export const MARKET_COOKIE = "xayven_market";
export const DISPLAY_CURRENCY_COOKIE = "xayven_display_currency";

/** Geo-IP header candidates, checked in this order. A SOFT SUGGESTION
 *  only — never treated as verified, never an antifraud signal, never
 *  authoritative over an explicit cookie. A visitor behind a VPN, a
 *  corporate proxy, or a header-less request simply falls through to the
 *  next tier; nothing here is meant to be tamper-proof. */
const GEO_COUNTRY_HEADERS = ["x-vercel-ip-country", "cf-ipcountry"];

export type MarketResolutionSource = "explicit_cookie" | "geo_suggestion" | "default";

export interface ResolvedCommercialMarket {
  market: PricingMarket;
  source: MarketResolutionSource;
}

/**
 * Resolves the commercial market for the current request. Priority:
 *   1. An explicit `xayven_market` cookie — trusted ONLY if it still
 *      resolves to a real, currently-active market (a stale/tampered/
 *      deactivated value silently degrades to the next tier, never
 *      throws — same "never trust the client, but never crash the
 *      visitor's turn over it" discipline as the AI chat route's
 *      promotionId/serviceSlug re-validation).
 *   2. A geo-IP header, routed through market_countries via
 *      getMarketForCountry() — which itself never returns null, so this
 *      tier always produces SOME market (possibly 'OTHER').
 *   3. 'OTHER', the safety-net market, when no geo header is present at
 *      all.
 *
 * Never returns null, never throws — for ANY input, including an
 * environment where International Pricing's tables aren't queryable yet
 * (see HARDCODED_FALLBACK_MARKET's doc comment). Worst case, this
 * degrades to the hardcoded COP/BASE_REFERENCE fallback, never a crashed
 * page — pricing display must never be a hard dependency a visitor's
 * request can fail on.
 */
export async function resolveCommercialMarket(): Promise<ResolvedCommercialMarket> {
  const cookieStore = await cookies();
  const explicitCode = cookieStore.get(MARKET_COOKIE)?.value;
  if (explicitCode) {
    const market = await getPricingMarketByCode(explicitCode);
    if (market && market.isActive) return { market, source: "explicit_cookie" };
  }

  const headerList = await headers();
  for (const headerName of GEO_COUNTRY_HEADERS) {
    const country = headerList.get(headerName);
    if (country) {
      const market = await getMarketForCountry(country);
      return { market, source: market.code === DEFAULT_FALLBACK_MARKET_CODE ? "default" : "geo_suggestion" };
    }
  }

  const fallback = await getPricingMarketByCode(DEFAULT_FALLBACK_MARKET_CODE);
  return { market: fallback ?? HARDCODED_FALLBACK_MARKET, source: "default" };
}

export type DisplayCurrencySource = "explicit_cookie" | "market_default";

export interface ResolvedDisplayCurrency {
  currency: string;
  source: DisplayCurrencySource;
}

/**
 * Resolves the DISPLAY currency — independent of, and never influencing,
 * `resolveCommercialMarket()`. Reads its own cookie
 * (`xayven_display_currency`), completely separate storage from
 * `xayven_market`. Defaults to the resolved market's own currency (the
 * common case: no secondary conversion needed at all) when no explicit
 * preference has been set.
 *
 * Deliberately takes the already-resolved `market` as a parameter rather
 * than re-resolving it — this is what makes the separation structural in
 * code, not just documentation: there is no code path in this file where
 * a display-currency cookie could feed back into which market gets used.
 */
export async function resolveDisplayCurrency(market: PricingMarket): Promise<ResolvedDisplayCurrency> {
  const cookieStore = await cookies();
  const explicit = cookieStore.get(DISPLAY_CURRENCY_COOKIE)?.value;
  if (explicit) return { currency: explicit, source: "explicit_cookie" };
  return { currency: market.currency, source: "market_default" };
}
