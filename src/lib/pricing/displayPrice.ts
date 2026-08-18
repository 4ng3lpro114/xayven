import "server-only";
import { getLatestExchangeRate } from "@/lib/db/exchangeRateStore";
import { getCurrencyConfig } from "@/lib/db/currencyConfigStore";
import { roundCommercial, MAX_EXCHANGE_RATE_AGE_MS } from "@/lib/pricing/convertPrice";
import type { OfficialPriceResult } from "@/lib/pricing/market/types";

/**
 * International Pricing — Phase D. Converts an ALREADY-RESOLVED official
 * price (from resolveOfficialPrice.ts) into a different DISPLAY currency,
 * for presentation only. This is a completely separate concern from the
 * commercial conversion tier in convertPrice.ts's `convertFromBase()`:
 *
 *   - convertFromBase()  → COP base price → a MARKET's official currency.
 *                           Feeds resolveOfficialPrice()'s "converted"
 *                           source. Decides an OFFICIAL number.
 *   - toDisplayPrice()   → an already-official amount (in its market's
 *                           currency) → a visitor's chosen DISPLAY
 *                           currency. Never changes which market/price is
 *                           official — see commercialContext.ts's module
 *                           doc for the full commercialMarket vs.
 *                           displayCurrency separation.
 *
 * "US market official price is $399 USD; visitor switches display
 * currency to COP" → this returns the COP EQUIVALENT of $399, never the
 * Colombian market's own 799.000 COP official price. The two numbers can
 * legitimately differ, and this function has no way to even see the
 * Colombian price — it only ever transforms the number it was given.
 */

export interface DisplayPrice {
  amount: number;
  currency: string;
  /** true only when displayCurrency === the official price's own
   *  currency (no conversion happened — this IS the official number).
   *  false means this is a computed equivalent for presentation only,
   *  never itself a new official price. */
  isOfficial: boolean;
}

/**
 * Returns null (never a guessed number) when:
 *   - the official result has no amount to begin with (source ===
 *     "unavailable" already, nothing to display);
 *   - a safe, fresh, properly-rounded cross-currency equivalent can't
 *     currently be computed for one or both legs of the conversion.
 *
 * On null, callers show the official price in its own currency instead —
 * display currency is a presentation nicety layered on top of a real
 * price, never a requirement for a price to be shown at all.
 */
export async function toDisplayPrice(
  official: Pick<OfficialPriceResult, "amount" | "currency">,
  displayCurrency: string
): Promise<DisplayPrice | null> {
  if (official.amount === null) return null;
  if (displayCurrency === official.currency) {
    return { amount: official.amount, currency: official.currency, isOfficial: true };
  }

  const copEquivalent = await toCopEquivalent(official.amount, official.currency);
  if (copEquivalent === null) return null;

  if (displayCurrency === "COP") {
    const config = await getCurrencyConfig("COP");
    if (!config) return null;
    return { amount: roundCommercial(copEquivalent, config.roundingUnit), currency: "COP", isOfficial: false };
  }

  const [rate, config] = await Promise.all([getLatestExchangeRate(displayCurrency), getCurrencyConfig(displayCurrency)]);
  if (!rate || !config) return null;
  if (Date.now() - new Date(rate.fetchedAt).getTime() > MAX_EXCHANGE_RATE_AGE_MS) return null;

  return { amount: roundCommercial(copEquivalent * rate.rate, config.roundingUnit), currency: displayCurrency, isOfficial: false };
}

/**
 * `amount` (in `currency`) → its COP equivalent, via the inverse of
 * `currency`'s own COP→currency rate — the same rate/staleness guards as
 * convertPrice.ts's convertFromBase(), just run in reverse. COP itself
 * needs no rate at all (trivially itself).
 */
async function toCopEquivalent(amount: number, currency: string): Promise<number | null> {
  if (currency === "COP") return amount;

  const rate = await getLatestExchangeRate(currency);
  if (!rate) return null;
  if (Date.now() - new Date(rate.fetchedAt).getTime() > MAX_EXCHANGE_RATE_AGE_MS) return null;

  return amount / rate.rate;
}

/**
 * Display-currency wiring (International Pricing Phase D — Display
 * Currency). Applies `toDisplayPrice()` to an already-resolved
 * `OfficialPriceResult`, returning a new result with `amount`/`currency`
 * replaced by the display-currency equivalent — every other field
 * (itemSlug, marketCode, priceType, source, effectiveAt…) is preserved
 * unchanged, so callers that still care which market/official price this
 * came from can always tell. `marketCode` is never touched here — this
 * function only ever runs AFTER resolveOfficialPrice() has already picked
 * the official price for a market; it has no way to pick a different one.
 *
 * Falls back to the official price completely untouched (never null, never
 * a fabricated number) when:
 *   - official.amount is null (nothing to display — "unavailable" stays
 *     "unavailable", never masked as a conversion failure);
 *   - displayCurrency === official.currency (nothing to convert);
 *   - toDisplayPrice() itself returns null (no fresh rate / no currency
 *     config) — the visitor still sees the real official number, just in
 *     its own currency instead of their preferred display one.
 */
export async function withDisplayPrice(
  official: OfficialPriceResult,
  displayCurrency: string
): Promise<OfficialPriceResult> {
  if (official.amount === null) return official;
  const converted = await toDisplayPrice(official, displayCurrency);
  if (!converted) return official;
  return { ...official, amount: converted.amount, currency: converted.currency };
}
