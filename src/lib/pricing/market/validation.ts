import { z } from "zod";

/**
 * International Pricing — Phase B: shape validation for
 * pricing_markets / market_countries / pricing_market_prices. Same
 * discipline as src/lib/pricing/validation.ts: written now so a future
 * Admin create/edit flow (Phase D) can reuse these directly.
 */

const marketCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Z0-9_-]+$/, "El código de mercado solo puede tener mayúsculas, números, guiones y guion bajo.");

/** International Pricing — Canonical Anchor (approved 2026-08-18): widened
 *  to include EUR for the INTERNATIONAL commercial market (EU/US sibling
 *  markets, see src/lib/pricing/marketSync.ts). Still a deliberate,
 *  explicit widening — never a silent free string — same discipline as
 *  every other enum-via-CHECK in this codebase. */
const currencySchema = z.enum(["COP", "USD", "EUR"]);

const fallbackBehaviorSchema = z.enum(["QUOTE_ONLY", "BASE_REFERENCE"]);

export const pricingMarketSchema = z.object({
  code: marketCodeSchema,
  name: z.string().trim().min(1).max(80),
  currency: currencySchema,
  conversionAllowed: z.boolean(),
  fallbackBehavior: fallbackBehaviorSchema,
  isActive: z.boolean(),
});

export type PricingMarketInput = z.infer<typeof pricingMarketSchema>;

export const createPricingMarketSchema = pricingMarketSchema;

/** `code` is immutable after creation — same "identity fields never
 *  change post-creation" discipline as pricing_catalog's slug. */
export const updatePricingMarketSchema = pricingMarketSchema.omit({ code: true }).partial();

export type UpdatePricingMarketInput = z.infer<typeof updatePricingMarketSchema>;

const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(2, "ISO 3166-1 alpha-2 (2 letras).")
  .regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2, solo letras mayúsculas.");

export const marketCountrySchema = z.object({
  countryCode: countryCodeSchema,
  marketId: z.string().uuid(),
});

export type MarketCountryInput = z.infer<typeof marketCountrySchema>;

const priceTypeSchema = z.enum(["FIXED", "FROM"]);

export const pricingMarketPriceSchema = z.object({
  pricingCatalogId: z.string().uuid(),
  marketId: z.string().uuid(),
  /** Must equal the referenced market's own currency — enforced in
   *  pricingMarketStore.ts's createPricingMarketPrice(), never trusted
   *  from this shape check alone (a shape check can't see the DB). */
  currency: currencySchema,
  priceType: priceTypeSchema,
  price: z.number().int().positive(),
  isActive: z.boolean(),
});

export type PricingMarketPriceInput = z.infer<typeof pricingMarketPriceSchema>;

export const createPricingMarketPriceSchema = pricingMarketPriceSchema;

/**
 * `pricingCatalogId`/`marketId`/`currency` are all immutable after
 * creation — repointing which item/market a price row belongs to isn't a
 * price edit, it's a different fact, same as pricing_catalog's
 * slug/category/billingInterval. `currency` specifically can never be
 * edited independently of `marketId` (it would let a row's currency drift
 * away from its own market's currency) — if the market's currency is
 * wrong, the fix is a new row, not a patch.
 */
export const updatePricingMarketPriceSchema = pricingMarketPriceSchema
  .omit({ pricingCatalogId: true, marketId: true, currency: true })
  .partial();

export type UpdatePricingMarketPriceInput = z.infer<typeof updatePricingMarketPriceSchema>;
