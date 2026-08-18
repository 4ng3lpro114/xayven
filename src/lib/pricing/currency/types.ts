/**
 * International Pricing — Phase C: domain model for currency-level
 * configuration and the exchange-rate cache. Mirrors the structure of
 * src/lib/pricing/market/types.ts — its own sub-domain file, not merged
 * into an existing one.
 *
 * These two tables exist ONLY to make the "converted" tier of
 * resolveOfficialPrice() deterministic and safe:
 *   - CurrencyConfig supplies the commercial rounding rule (never guessed
 *     ad hoc wherever a converted amount is displayed).
 *   - ExchangeRate is an append-only cache — never overwritten in place,
 *     so a past conversion can always be traced back to the exact rate
 *     used.
 *
 * See supabase/migrations/0024_currency_config.sql,
 * 0025_exchange_rates.sql for the exact schema these map to.
 */

/** Commercial rounding rule for one currency. `roundingUnit` — round to
 *  the nearest multiple of this (e.g. COP=1000, USD=1). `decimalPlaces` —
 *  display-only metadata (this codebase's money amounts are always
 *  stored as whole integers, never fractional). */
export interface CurrencyConfig {
  currency: string;
  roundingUnit: number;
  decimalPlaces: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One cached exchange-rate observation. Append-only — a row is never
 * updated after insert, only superseded by a newer row with a later
 * `fetchedAt`. `rate` is "how many `quoteCurrency` units equal 1
 * `baseCurrency` unit" — converting a base amount multiplies by `rate`.
 *
 * `baseCurrency` is always "COP" in this system (pricing_catalog.basePrice
 * is always COP — see Pricing Core) — kept as an explicit field rather
 * than assumed, so a future multi-base scenario doesn't require a schema
 * change, even though Phase C only ever writes/reads "COP" here.
 */
export interface ExchangeRate {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  /** Where this observation came from. Phase C never calls a live
   *  external provider itself — every row recorded in this phase carries
   *  a source describing manual/test entry. A real provider integration
   *  is a separate, explicitly approved future step (see the Phase C
   *  checkpoint's "riesgos y pendientes"). */
  source: string;
  fetchedAt: string;
  createdAt: string;
}
