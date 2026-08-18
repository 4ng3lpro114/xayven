import "server-only";
import { getLatestExchangeRate } from "@/lib/db/exchangeRateStore";
import { getCurrencyConfig } from "@/lib/db/currencyConfigStore";

/**
 * International Pricing — Phase C: the deterministic conversion tier
 * consumed exclusively by resolveOfficialPrice.ts's "converted" branch.
 * NEVER called by XAYVEN AI directly, NEVER estimates — every guard below
 * returns `null` (never an approximate number) whenever a real, fresh,
 * properly-configured conversion isn't currently possible. `null` here
 * means resolveOfficialPrice() falls through to the market's
 * `fallback_behavior`, exactly as if conversion weren't allowed at all —
 * the visitor still never sees an invented or arbitrarily-rounded price.
 */

/** How old a cached rate is allowed to be before it's treated as
 *  unusable. 48h — informational/fallback pricing doesn't need
 *  intraday freshness, but a rate from last week is stale enough to
 *  misrepresent an actual market price. Deliberately conservative; revisit
 *  once real traffic/provider data exists (see the Phase C checkpoint's
 *  "riesgos y pendientes"). */
export const MAX_EXCHANGE_RATE_AGE_MS = 48 * 60 * 60 * 1000;

/** Round to the nearest multiple of `roundingUnit` — the ONE shared
 *  commercial-rounding rule (Phase A §11), reused everywhere a converted
 *  amount is computed. Never a second rounding rule invented ad hoc
 *  elsewhere. */
export function roundCommercial(amount: number, roundingUnit: number): number {
  return Math.round(amount / roundingUnit) * roundingUnit;
}

export interface ConvertedPrice {
  amount: number;
  /** The `fetchedAt` of the exact rate observation used — this is what
   *  OfficialPriceResult.effectiveAt carries onward, so a future snapshot
   *  (Phase D) can always trace a converted price back to the rate that
   *  produced it. */
  effectiveAt: string;
}

/**
 * Converts a COP base amount into `quoteCurrency`, or returns `null` if
 * that cannot be done safely right now. Every failure mode is explicit:
 *
 *   - `quoteCurrency === "COP"`   → nothing to convert (defensive no-op;
 *                                    a COP market should never reach this
 *                                    tier via a real price/BASE_REFERENCE
 *                                    anyway).
 *   - no rate ever recorded       → null.
 *   - rate exists but older than
 *     MAX_EXCHANGE_RATE_AGE_MS    → null (never uses a stale rate
 *                                    silently).
 *   - no CurrencyConfig for the
 *     target currency             → null (never invents a rounding rule).
 */
export async function convertFromBase(baseAmount: number, quoteCurrency: string): Promise<ConvertedPrice | null> {
  if (quoteCurrency === "COP") return null;

  const [rate, config] = await Promise.all([getLatestExchangeRate(quoteCurrency), getCurrencyConfig(quoteCurrency)]);

  if (!rate) return null;
  if (!config) return null;

  const ageMs = Date.now() - new Date(rate.fetchedAt).getTime();
  if (ageMs > MAX_EXCHANGE_RATE_AGE_MS) return null;

  const rawAmount = baseAmount * rate.rate;
  return { amount: roundCommercial(rawAmount, config.roundingUnit), effectiveAt: rate.fetchedAt };
}
