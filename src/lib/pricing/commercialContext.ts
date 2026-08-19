import "server-only";
import { cookies, headers } from "next/headers";
import { getPricingMarketByCode, getMarketForCountry } from "@/lib/db/pricingMarketStore";
import { getClientIpFromHeaders } from "@/lib/rateLimit";
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

/**
 * XAYVEN CORE Phase 3.1 (International Geolocation fix) — resolves an IP
 * to a 2-letter country code using a LOCAL GeoIP database (`geoip-lite`,
 * bundled in `node_modules` at install time), never a header.
 *
 * Root cause this replaces (Phase 3.0 audit): the previous implementation
 * checked `x-vercel-ip-country`/`cf-ipcountry` — headers injected only by
 * Vercel's and Cloudflare's own edge networks respectively. XAYVEN runs on
 * Hostinger's `hcdn`, neither of the two — confirmed both by Hostinger's
 * own official documentation (their GeoIP feature is `.htaccess`+PHP
 * `$_SERVER`-only, structurally unreachable from Node.js) and by direct,
 * repeated inspection of `xayven.com`'s real production response headers.
 * Those two headers could therefore NEVER be present, for any visitor,
 * ever — every visitor without a manual cookie silently fell to
 * 'OTHER'/COP, regardless of where they actually were.
 *
 * `geoip-lite` chosen over `@maxmind/geoip2-node` + a real MaxMind
 * GeoLite2-Country `.mmdb` specifically because the latter requires a
 * MaxMind account + license key this environment has no way to obtain or
 * configure autonomously. `geoip-lite` ships a working (if periodically
 * stale — the MaxMind license doesn't allow redistributing the latest
 * snapshot) country database directly inside the npm package, so
 * `npm install` alone makes it fully functional — no account, no
 * credentials, no runtime network call, no extra build step. Trade-off,
 * stated plainly: ~110MB on disk / higher RSS than a country-only
 * alternative would use, and accuracy that's "reasonable, not perfect" —
 * the same intrinsic limitation any IP-based geolocation has. If this
 * ever needs to be upgraded to a licensed, actively-updated MaxMind
 * database, that's a valid future change (would need MAXMIND_LICENSE_KEY
 * supplied by the user) — not required for this fix to be correct.
 *
 * Loaded via a dynamic `import()`, not a static top-level one, and always
 * inside a try/catch — deliberately, so that if the bundled data file is
 * ever missing/corrupt, the FAILURE stays contained to this one function
 * (degrading to the next resolution tier) instead of throwing at module
 * load time and breaking every page that imports commercialContext.ts
 * (which is all of them). Same "pricing display must never be a hard
 * dependency a visitor's request can fail on" discipline already
 * documented on resolveCommercialMarket() below.
 */
async function lookupCountryFromIp(ip: string): Promise<string | null> {
  if (ip === "unknown") return null;
  try {
    // `geoip-lite` is a CJS module (`module.exports = {...}`). Confirmed
    // by direct testing that a dynamic `import()` of it does NOT always
    // expose `lookup` as a top-level named export — depending on the
    // runtime's ESM/CJS interop, the real `module.exports` object can
    // land on `mod.default` instead, leaving a naive `{ lookup } = await
    // import(...)` destructure `undefined` (which then throws when
    // called, silently swallowed by this function's own try/catch —
    // exactly the failure mode that made this bug invisible until it was
    // tested against a real running server rather than a mock). Checking
    // both shapes is what makes this robust across dev/build/deploy
    // environments that may interop CJS differently.
    const mod = await import("geoip-lite");
    const lookup = mod.lookup ?? mod.default?.lookup;
    return lookup?.(ip)?.country ?? null;
  } catch {
    return null;
  }
}

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
 *      promotionId/serviceSlug re-validation). This is the ONLY tier
 *      that ever gets written to a cookie, and ONLY by an explicit click
 *      on "CommercialMarketSelector" — geo-detection below never writes
 *      this cookie, so a manual choice can never be silently mistaken
 *      for (or silently overwritten by) a later automatic detection, and
 *      a stale manual cookie is always undoable with one click on
 *      "Detectar automáticamente" (which just expires this cookie).
 *   2. A local geo-IP lookup (`lookupCountryFromIp()` above) against the
 *      visitor's real IP (`getClientIpFromHeaders()`, same primitive
 *      already proven in production for rate-limiting), routed through
 *      market_countries via getMarketForCountry() — which itself never
 *      returns null, so this tier always produces SOME market (possibly
 *      'OTHER', if the detected country has no row in market_countries).
 *   3. 'OTHER', the safety-net market, when the IP can't be determined at
 *      all, or the local GeoIP lookup itself fails/has no data for it.
 *
 * Never returns null, never throws — for ANY input, including an
 * environment where International Pricing's tables aren't queryable yet
 * (see HARDCODED_FALLBACK_MARKET's doc comment) or where the GeoIP
 * database can't be loaded (see lookupCountryFromIp()'s doc comment).
 * Worst case, this degrades to the hardcoded COP/BASE_REFERENCE fallback,
 * never a crashed page — pricing display must never be a hard dependency
 * a visitor's request can fail on.
 */
export async function resolveCommercialMarket(): Promise<ResolvedCommercialMarket> {
  const cookieStore = await cookies();
  const explicitCode = cookieStore.get(MARKET_COOKIE)?.value;
  if (explicitCode) {
    const market = await getPricingMarketByCode(explicitCode);
    if (market && market.isActive) return { market, source: "explicit_cookie" };
  }

  const headerList = await headers();
  const ip = getClientIpFromHeaders(headerList);
  const country = await lookupCountryFromIp(ip);
  if (country) {
    const market = await getMarketForCountry(country);
    return { market, source: market.code === DEFAULT_FALLBACK_MARKET_CODE ? "default" : "geo_suggestion" };
  }

  const fallback = await getPricingMarketByCode(DEFAULT_FALLBACK_MARKET_CODE);
  return { market: fallback ?? HARDCODED_FALLBACK_MARKET, source: "default" };
}

/**
 * XAYVEN CORE Phase 3.1 — the UI-facing vocabulary for `MarketResolutionSource`,
 * deliberately kept as a SEPARATE, PRESENTATIONAL mapping rather than
 * renaming `MarketResolutionSource`'s own values. Renaming the source type
 * itself would mean touching every internal caller/test of
 * `resolveCommercialMarket()` for zero behavioral gain — the internal
 * names (`explicit_cookie`/`geo_suggestion`/`default`) are exact and
 * accurate; what was missing was never the internal vocabulary, it was
 * that the UI collapsed `geo_suggestion` and `default` into one
 * indistinguishable "Automatic" label (see CommercialMarketSelector.tsx's
 * pre-Phase-3.1 `isManual` boolean). This function is the one place that
 * translation happens, so every consumer (Footer/layout/the selector
 * itself) reads the same 3-way distinction the same way.
 */
export type MarketDetectionState = "manual" | "detected" | "fallback";

export function toMarketDetectionState(source: MarketResolutionSource): MarketDetectionState {
  switch (source) {
    case "explicit_cookie":
      return "manual";
    case "geo_suggestion":
      return "detected";
    case "default":
      return "fallback";
  }
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
