/**
 * International Pricing — Phase B: domain model for MARKET, the single
 * commercial pricing key approved in "PHASE A — APPROVED" (see
 * XAYVEN_INTERNATIONAL_PRICING_AI_ARCHITECTURE.md). Mirrors the structure
 * of src/lib/pricing/types.ts / src/lib/promotions/types.ts — a new
 * sub-domain gets its own file, not merged into an existing one.
 *
 * Country → Market → Currency → official price. `currency` never appears
 * as an input key anywhere in this file or in resolveOfficialPrice() —
 * only ever as an attribute read off a PricingMarket or as output.
 *
 * See supabase/migrations/0021_pricing_markets.sql,
 * 0022_market_countries.sql, 0023_pricing_market_prices.sql for the exact
 * schema these map to.
 */

/**
 * What a market falls back to when it has no official price for an item
 * AND conversion is not allowed (or, in Phase B, conversion is simply not
 * implemented yet — see resolveOfficialPrice.ts).
 *
 *   QUOTE_ONLY      → no price is shown for this market; the visitor is
 *                      offered a personalized quote instead.
 *   BASE_REFERENCE  → the catalog's base (COP) price is shown, explicitly
 *                      labeled as a reference, never as what will be
 *                      charged.
 *
 * A brand-new market always defaults to QUOTE_ONLY — the system never
 * assumes permission to show a number it isn't sure is commercially
 * correct for that market.
 */
export type MarketFallbackBehavior = "QUOTE_ONLY" | "BASE_REFERENCE";

/**
 * A named commercial price zone — XAYVEN's own abstraction (Phase A
 * Revision 2, "Market debe ser... C. una abstracción propia de XAYVEN"),
 * never assumed to equal a country or a currency. Exactly one currency per
 * market; multiple markets may share a currency with different official
 * prices (e.g. two separate USD markets).
 */
export interface PricingMarket {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Admin-defined, stable identifier — e.g. "US", "ES", "DE", "CO",
   *  "OTHER". Never a country code by assumption (a market MAY be scoped
   *  to one country, but nothing here requires it). */
  code: string;
  name: string;
  currency: string;
  /** Explicit commercial decision — never implicit. False by default for
   *  every newly created market (see 0021's seed / createPricingMarket
   *  defaults). */
  conversionAllowed: boolean;
  /** Only consulted when there's no official price AND conversion isn't
   *  allowed/available. */
  fallbackBehavior: MarketFallbackBehavior;
  /** Soft-state — never physically deleted, same discipline as every
   *  other reference table in this codebase. */
  isActive: boolean;
}

/** Stable identifier for the one market every unmapped/unsupported country
 *  ultimately routes to. Seeded once, structurally, in Phase B — see
 *  pricingMarketStore.ts. Never re-typed as a string literal elsewhere. */
export const DEFAULT_FALLBACK_MARKET_CODE = "OTHER";

/**
 * Phase D — absolute last-resort market, used ONLY when even the seeded
 * 'OTHER' row can't be read (e.g. a real Supabase connection is
 * configured but the International Pricing migrations haven't been
 * applied to it yet — a real, observed mid-rollout state, not a
 * hypothetical). A synthetic, in-code embodiment of the exact same
 * guarantee the seeded 'OTHER' row provides — "when the system genuinely
 * knows nothing else, fall back to Pricing Core's own base COP price" —
 * so that resolveCommercialMarket() (commercialContext.ts) and
 * getMarketForCountry() (pricingMarketStore.ts) NEVER hard-crash a
 * visitor's request over missing International Pricing infrastructure.
 * Never persisted; `id` is a fixed sentinel, never a real database id. */
export const HARDCODED_FALLBACK_MARKET: PricingMarket = {
  id: "hardcoded-fallback-market",
  createdAt: "1970-01-01T00:00:00.000Z",
  updatedAt: "1970-01-01T00:00:00.000Z",
  code: DEFAULT_FALLBACK_MARKET_CODE,
  name: "Other markets (unassigned)",
  currency: "COP",
  conversionAllowed: false,
  fallbackBehavior: "BASE_REFERENCE",
  isActive: true,
};

/**
 * Country → market routing. One row per country (a country belongs to
 * exactly one market); a market may have zero, one, or many countries
 * routed to it. A country with no row here is NOT an error — it simply
 * resolves to the default fallback market (getMarketForCountry() in
 * pricingMarketStore.ts never returns null).
 */
export interface MarketCountry {
  /** ISO 3166-1 alpha-2, uppercase (e.g. "US", "CO", "DE"). Primary key —
   *  a country can only ever route to one market at a time. */
  countryCode: string;
  marketId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * The official price of ONE pricing_catalog item in ONE market. This is
 * the table that actually answers "what does START cost in the US
 * market" — replaces the per-currency override model discarded in Phase A
 * Revision 2. `currency` is a denormalized copy of the owning market's
 * currency, written once at creation and never independently editable
 * (see market/validation.ts) — it can never drift from market.currency.
 */
export interface PricingMarketPrice {
  id: string;
  createdAt: string;
  updatedAt: string;
  pricingCatalogId: string;
  marketId: string;
  currency: string;
  priceType: "FIXED" | "FROM";
  price: number;
  /** Soft-state, never physically deleted. */
  isActive: boolean;
  /** When this became the official price — distinct from createdAt so a
   *  future backdated/scheduled price change has somewhere real to live
   *  without rewriting history. */
  effectiveAt: string;
}

/**
 * Where a resolved price came from — surfaced to every caller (Web, Admin,
 * XAYVEN AI's tool result in Phase E, the future Payments wrapper) so none
 * of them ever has to guess whether a number is authoritative.
 *
 *   market_price    → an active PricingMarketPrice exists. Authoritative.
 *   converted       → Phase C only; always unreachable in Phase B (see
 *                      resolveOfficialPrice.ts's documented stub).
 *   base_reference  → no official price for this market; fallbackBehavior
 *                      is BASE_REFERENCE, so the catalog's base COP price
 *                      is returned, explicitly non-authoritative.
 *   unavailable     → no official price, and no fallback number to show
 *                      (QUOTE_ONLY, or the item/market itself couldn't be
 *                      resolved). `amount` is always null here.
 */
export type OfficialPriceSource = "market_price" | "converted" | "base_reference" | "unavailable";

/**
 * The ONE shape resolveOfficialPrice() ever returns. This is also the
 * exact shape the future XAYVEN AI tool-calling result (Phase E) is
 * expected to mirror — see the Phase A checkpoint's
 * `get_official_price(...)` contract. `amount` is null if and only if
 * `source === "unavailable"` — never a number attached to a non-official
 * result without saying so via `source`.
 */
export interface OfficialPriceResult {
  itemSlug: string;
  marketCode: string;
  currency: string;
  amount: number | null;
  priceType: "FIXED" | "FROM" | null;
  billingInterval: "ONE_TIME" | "MONTHLY" | null;
  source: OfficialPriceSource;
  /** ISO timestamp the returned price became/was last confirmed official.
   *  Null iff source === "unavailable". */
  effectiveAt: string | null;
}
