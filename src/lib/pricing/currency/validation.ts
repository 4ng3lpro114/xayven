import { z } from "zod";

/**
 * International Pricing — Phase C: shape validation for currency_config /
 * exchange_rates. Same discipline as pricing/validation.ts and
 * pricing/market/validation.ts — written now so a future Admin flow
 * (currency_config) or ingestion job (exchange_rates, Phase D+) can reuse
 * these directly.
 */

/** Same closed set used everywhere else in Pricing Core / Markets.
 *  Extending it is a deliberate, explicit widening — never a silent free
 *  string. */
const currencySchema = z.enum(["COP", "USD"]);

export const currencyConfigSchema = z.object({
  currency: currencySchema,
  roundingUnit: z.number().int().positive(),
  decimalPlaces: z.number().int().nonnegative(),
});

export type CurrencyConfigInput = z.infer<typeof currencyConfigSchema>;

/**
 * exchange_rates is append-only — there is deliberately no "update"
 * schema. A new observation is always a new row (recordExchangeRate() in
 * exchangeRateStore.ts), never a patch to an existing one.
 */
export const recordExchangeRateSchema = z.object({
  quoteCurrency: currencySchema,
  rate: z.number().positive(),
  source: z.string().trim().min(1).max(80),
});

export type RecordExchangeRateInput = z.infer<typeof recordExchangeRateSchema>;
