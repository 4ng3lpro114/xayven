import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/db/supabase";
import { getGlobalMap } from "@/lib/db/memoryStore";
import type { MarketFallbackBehavior, MarketCountry, PricingMarket, PricingMarketPrice } from "@/lib/pricing/market/types";
import { DEFAULT_FALLBACK_MARKET_CODE, HARDCODED_FALLBACK_MARKET } from "@/lib/pricing/market/types";
import type {
  PricingMarketInput,
  UpdatePricingMarketInput,
  PricingMarketPriceInput,
  UpdatePricingMarketPriceInput,
} from "@/lib/pricing/market/validation";

/**
 * International Pricing — Phase B (data model). Same Supabase-or-memory
 * shape as pricingCatalogStore.ts / promotionStore.ts. Three tables in one
 * file — small and tightly coupled: a market price is meaningless without
 * its market, a country route is meaningless without its market.
 *
 * Unlike pricing_catalog's memory fallback (pre-seeded with all 8 real
 * commercial items — that table is reference/config data), this store's
 * memory fallback seeds ONLY the single safety-net market
 * ('OTHER'/COP/QUOTE_ONLY/conversion disabled). Phase A Rule 11 is
 * explicit: no definitive international commercial price gets seeded
 * until approved. Every real market, country route, and market price
 * starts genuinely empty and is created through the app (Admin, Phase D),
 * same as every transactional store elsewhere in this codebase.
 */

const marketStore = getGlobalMap<string, PricingMarket>("pricing.markets");
/** Keyed by countryCode directly (it's the natural primary key — a
 *  country can only ever route to one market). */
const marketCountryStore = getGlobalMap<string, MarketCountry>("pricing.marketCountries");
const marketPriceStore = getGlobalMap<string, PricingMarketPrice>("pricing.marketPrices");

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Phase D: fallbackBehavior is BASE_REFERENCE, not QUOTE_ONLY as Phase B
 * originally seeded it. This is NOT a new international commercial price
 * (Phase A Rule 11 still holds) — 'OTHER's currency is COP, so
 * BASE_REFERENCE here just means "show pricing_catalog.basePrice", the
 * exact number already public on the site today. QUOTE_ONLY as the
 * default for every OTHER new market Admin creates (Phase D admin
 * routes) is untouched — this only changes the one pre-seeded safety-net
 * row, so that a visitor whose market can't be determined still sees the
 * real, already-public COP price instead of the site silently hiding all
 * pricing (which QUOTE_ONLY would have caused for every visitor until
 * real markets are configured).
 */
const SEED_OTHER_MARKET: Omit<PricingMarket, "id" | "createdAt" | "updatedAt"> = {
  code: DEFAULT_FALLBACK_MARKET_CODE,
  name: "Other markets (unassigned)",
  currency: "COP",
  conversionAllowed: false,
  fallbackBehavior: "BASE_REFERENCE",
  isActive: true,
};

/** Lazily seeds ONLY the 'OTHER' market, exactly once per process —
 *  mirrors the migration's `ON CONFLICT (code) DO NOTHING` idempotency for
 *  the memory-fallback branch. */
function ensureMemorySeeded(): void {
  if (marketStore.size > 0) return;
  const timestamp = nowIso();
  const id = `seed-${SEED_OTHER_MARKET.code.toLowerCase()}`;
  marketStore.set(id, { ...SEED_OTHER_MARKET, id, createdAt: timestamp, updatedAt: timestamp });
}

// ---------------------------------------------------------------------------
// pricing_markets
// ---------------------------------------------------------------------------

export class PricingMarketNotFoundError extends Error {
  constructor(id: string) {
    super(`Pricing market not found: ${id}`);
    this.name = "PricingMarketNotFoundError";
  }
}

export class PricingMarketCodeConflictError extends Error {
  constructor(code: string) {
    super(`A pricing market with code "${code}" already exists.`);
    this.name = "PricingMarketCodeConflictError";
  }
}

interface PricingMarketRow {
  id: string;
  created_at: string;
  updated_at: string;
  code: string;
  name: string;
  currency: string;
  conversion_allowed: boolean;
  fallback_behavior: string;
  is_active: boolean;
}

function rowToPricingMarket(row: PricingMarketRow): PricingMarket {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    code: row.code,
    name: row.name,
    currency: row.currency,
    conversionAllowed: row.conversion_allowed,
    fallbackBehavior: row.fallback_behavior as MarketFallbackBehavior,
    isActive: row.is_active,
  };
}

export async function listPricingMarkets(options?: { activeOnly?: boolean }): Promise<PricingMarket[]> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    ensureMemorySeeded();
    return [...marketStore.values()]
      .filter((m) => !options?.activeOnly || m.isActive)
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  let query = supabase.from("pricing_markets").select("*").order("code", { ascending: true });
  if (options?.activeOnly) query = query.eq("is_active", true);

  const { data } = await query;
  return (data ?? []).map((row) => rowToPricingMarket(row as PricingMarketRow));
}

export async function getPricingMarketByCode(code: string): Promise<PricingMarket | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    ensureMemorySeeded();
    return [...marketStore.values()].find((m) => m.code === code) ?? null;
  }

  const { data } = await supabase.from("pricing_markets").select("*").eq("code", code).maybeSingle();
  return data ? rowToPricingMarket(data as PricingMarketRow) : null;
}

export async function getPricingMarketById(id: string): Promise<PricingMarket | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    ensureMemorySeeded();
    return marketStore.get(id) ?? null;
  }

  const { data } = await supabase.from("pricing_markets").select("*").eq("id", id).maybeSingle();
  return data ? rowToPricingMarket(data as PricingMarketRow) : null;
}

/**
 * Country → market routing, with the fallback that makes the resolver
 * TOTAL — never null, never a throw, for ANY input, including the case
 * where International Pricing's own tables aren't queryable yet (a real
 * Supabase connection configured but the migrations not yet applied is a
 * genuine, observed mid-rollout state — see HARDCODED_FALLBACK_MARKET's
 * doc comment). An unmapped (or inactive-market-mapped) country resolves
 * to the seeded 'OTHER' market when it can be read, or to the hardcoded
 * in-code equivalent when it can't — either way, the caller always gets a
 * usable, COP-based, BASE_REFERENCE market, never a crashed request.
 */
export async function getMarketForCountry(countryCode: string): Promise<PricingMarket> {
  const route = await getMarketCountry(countryCode);
  if (route) {
    const market = await getPricingMarketById(route.marketId);
    if (market && market.isActive) return market;
  }

  const other = await getPricingMarketByCode(DEFAULT_FALLBACK_MARKET_CODE);
  return other ?? HARDCODED_FALLBACK_MARKET;
}

// Writes — Admin Phase D CRUD, written now so that future flow can reuse
// it directly. Explicit field whitelist always, never a raw spread — same
// discipline as pricingCatalogStore.ts / promotionStore.ts.

export async function createPricingMarket(input: PricingMarketInput): Promise<PricingMarket> {
  const supabase = getSupabaseAdmin();
  const now = nowIso();
  const draft: PricingMarket = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    code: input.code,
    name: input.name,
    currency: input.currency,
    conversionAllowed: input.conversionAllowed,
    fallbackBehavior: input.fallbackBehavior,
    isActive: input.isActive,
  };

  if (!supabase) {
    ensureMemorySeeded();
    if ([...marketStore.values()].some((m) => m.code === draft.code)) {
      throw new PricingMarketCodeConflictError(draft.code);
    }
    marketStore.set(draft.id, draft);
    return draft;
  }

  const { data, error } = await supabase
    .from("pricing_markets")
    .insert({
      id: draft.id,
      code: draft.code,
      name: draft.name,
      currency: draft.currency,
      conversion_allowed: draft.conversionAllowed,
      fallback_behavior: draft.fallbackBehavior,
      is_active: draft.isActive,
    })
    .select("*")
    .single();

  if (error || !data) {
    if (error?.code === "23505") throw new PricingMarketCodeConflictError(draft.code);
    throw new Error(`[pricing_markets] createPricingMarket failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`);
  }

  return rowToPricingMarket(data as PricingMarketRow);
}

/** `code` is never touched here — see updatePricingMarketSchema. */
export async function updatePricingMarket(id: string, patch: UpdatePricingMarketInput): Promise<PricingMarket> {
  const current = await getPricingMarketById(id);
  if (!current) throw new PricingMarketNotFoundError(id);

  const updated: PricingMarket = {
    ...current,
    name: patch.name !== undefined ? patch.name : current.name,
    currency: patch.currency !== undefined ? patch.currency : current.currency,
    conversionAllowed: patch.conversionAllowed !== undefined ? patch.conversionAllowed : current.conversionAllowed,
    fallbackBehavior: patch.fallbackBehavior !== undefined ? patch.fallbackBehavior : current.fallbackBehavior,
    isActive: patch.isActive !== undefined ? patch.isActive : current.isActive,
    updatedAt: nowIso(),
  };

  const supabase = getSupabaseAdmin();

  if (!supabase) {
    marketStore.set(id, updated);
    return updated;
  }

  const { data, error } = await supabase
    .from("pricing_markets")
    .update({
      name: updated.name,
      currency: updated.currency,
      conversion_allowed: updated.conversionAllowed,
      fallback_behavior: updated.fallbackBehavior,
      is_active: updated.isActive,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`[pricing_markets] updatePricingMarket failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`);
  }

  return rowToPricingMarket(data as PricingMarketRow);
}

export async function setPricingMarketActive(id: string, isActive: boolean): Promise<PricingMarket> {
  return updatePricingMarket(id, { isActive });
}

// ---------------------------------------------------------------------------
// market_countries
// ---------------------------------------------------------------------------

export async function listMarketCountries(): Promise<MarketCountry[]> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return [...marketCountryStore.values()].sort((a, b) => a.countryCode.localeCompare(b.countryCode));
  }

  const { data } = await supabase.from("market_countries").select("*").order("country_code", { ascending: true });
  return (data ?? []).map((row) => rowToMarketCountry(row as MarketCountryRow));
}

interface MarketCountryRow {
  country_code: string;
  market_id: string;
  created_at: string;
  updated_at: string;
}

function rowToMarketCountry(row: MarketCountryRow): MarketCountry {
  return { countryCode: row.country_code, marketId: row.market_id, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function getMarketCountry(countryCode: string): Promise<MarketCountry | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return marketCountryStore.get(countryCode.toUpperCase()) ?? null;
  }

  const { data } = await supabase
    .from("market_countries")
    .select("*")
    .eq("country_code", countryCode.toUpperCase())
    .maybeSingle();
  return data ? rowToMarketCountry(data as MarketCountryRow) : null;
}

/**
 * Upsert — a country can only ever route to one market, so setting a route
 * that already exists repoints it rather than erroring. Validates the
 * target market actually exists first (an FK would catch it at the DB
 * layer too, but the memory branch has no FK, so this check is what makes
 * both branches behave identically — same "never trust the caller, but
 * this is the sanctioned server-side write path" discipline as everywhere
 * else in this codebase).
 */
export async function setMarketCountry(countryCode: string, marketId: string): Promise<MarketCountry> {
  const market = await getPricingMarketById(marketId);
  if (!market) throw new PricingMarketNotFoundError(marketId);

  const code = countryCode.toUpperCase();
  const now = nowIso();
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const existing = marketCountryStore.get(code);
    const row: MarketCountry = { countryCode: code, marketId, createdAt: existing?.createdAt ?? now, updatedAt: now };
    marketCountryStore.set(code, row);
    return row;
  }

  const { data, error } = await supabase
    .from("market_countries")
    .upsert({ country_code: code, market_id: marketId, updated_at: now }, { onConflict: "country_code" })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`[market_countries] setMarketCountry failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`);
  }

  return rowToMarketCountry(data as MarketCountryRow);
}

/** Removing a route is never an error even if none existed — the country
 *  simply resolves to the default market again via getMarketForCountry(). */
export async function removeMarketCountry(countryCode: string): Promise<void> {
  const code = countryCode.toUpperCase();
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    marketCountryStore.delete(code);
    return;
  }

  await supabase.from("market_countries").delete().eq("country_code", code);
}

// ---------------------------------------------------------------------------
// pricing_market_prices
// ---------------------------------------------------------------------------

export class MarketPriceNotFoundError extends Error {
  constructor(id: string) {
    super(`Pricing market price not found: ${id}`);
    this.name = "MarketPriceNotFoundError";
  }
}

export class MarketPriceConflictError extends Error {
  constructor(pricingCatalogId: string, marketId: string) {
    super(`A price already exists for catalog item "${pricingCatalogId}" in market "${marketId}".`);
    this.name = "MarketPriceConflictError";
  }
}

/** A market price's currency must always equal its own market's currency
 *  — this is what keeps `pricing_market_prices.currency` from ever
 *  drifting into a lie about which market it belongs to. */
export class MarketCurrencyMismatchError extends Error {
  constructor(marketCurrency: string, given: string) {
    super(`Market price currency "${given}" does not match its market's currency "${marketCurrency}".`);
    this.name = "MarketCurrencyMismatchError";
  }
}

interface PricingMarketPriceRow {
  id: string;
  created_at: string;
  updated_at: string;
  pricing_catalog_id: string;
  market_id: string;
  currency: string;
  price_type: string;
  price: number;
  is_active: boolean;
  effective_at: string;
}

function rowToPricingMarketPrice(row: PricingMarketPriceRow): PricingMarketPrice {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pricingCatalogId: row.pricing_catalog_id,
    marketId: row.market_id,
    currency: row.currency,
    priceType: row.price_type as PricingMarketPrice["priceType"],
    price: row.price,
    isActive: row.is_active,
    effectiveAt: row.effective_at,
  };
}

export async function listPricingMarketPrices(options?: {
  pricingCatalogId?: string;
  marketId?: string;
  activeOnly?: boolean;
}): Promise<PricingMarketPrice[]> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return [...marketPriceStore.values()]
      .filter((p) => !options?.pricingCatalogId || p.pricingCatalogId === options.pricingCatalogId)
      .filter((p) => !options?.marketId || p.marketId === options.marketId)
      .filter((p) => !options?.activeOnly || p.isActive);
  }

  let query = supabase.from("pricing_market_prices").select("*");
  if (options?.pricingCatalogId) query = query.eq("pricing_catalog_id", options.pricingCatalogId);
  if (options?.marketId) query = query.eq("market_id", options.marketId);
  if (options?.activeOnly) query = query.eq("is_active", true);

  const { data } = await query;
  return (data ?? []).map((row) => rowToPricingMarketPrice(row as PricingMarketPriceRow));
}

export async function getPricingMarketPrice(pricingCatalogId: string, marketId: string): Promise<PricingMarketPrice | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return (
      [...marketPriceStore.values()].find((p) => p.pricingCatalogId === pricingCatalogId && p.marketId === marketId) ?? null
    );
  }

  const { data } = await supabase
    .from("pricing_market_prices")
    .select("*")
    .eq("pricing_catalog_id", pricingCatalogId)
    .eq("market_id", marketId)
    .maybeSingle();
  return data ? rowToPricingMarketPrice(data as PricingMarketPriceRow) : null;
}

export async function getPricingMarketPriceById(id: string): Promise<PricingMarketPrice | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return marketPriceStore.get(id) ?? null;
  }

  const { data } = await supabase.from("pricing_market_prices").select("*").eq("id", id).maybeSingle();
  return data ? rowToPricingMarketPrice(data as PricingMarketPriceRow) : null;
}

/**
 * Phase A Rule 11: this function exists so Admin (Phase D) CAN define real
 * international commercial prices — it deliberately seeds none itself,
 * and nothing in Phase B ever calls it against a real market other than
 * 'OTHER' (which never gets a market price at all — it only exists for
 * its fallback behavior).
 */
export async function createPricingMarketPrice(input: PricingMarketPriceInput): Promise<PricingMarketPrice> {
  const market = await getPricingMarketById(input.marketId);
  if (!market) throw new PricingMarketNotFoundError(input.marketId);
  if (market.currency !== input.currency) throw new MarketCurrencyMismatchError(market.currency, input.currency);

  const supabase = getSupabaseAdmin();
  const now = nowIso();
  const draft: PricingMarketPrice = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    pricingCatalogId: input.pricingCatalogId,
    marketId: input.marketId,
    currency: input.currency,
    priceType: input.priceType,
    price: input.price,
    isActive: input.isActive,
    effectiveAt: now,
  };

  if (!supabase) {
    if (
      [...marketPriceStore.values()].some(
        (p) => p.pricingCatalogId === draft.pricingCatalogId && p.marketId === draft.marketId
      )
    ) {
      throw new MarketPriceConflictError(draft.pricingCatalogId, draft.marketId);
    }
    marketPriceStore.set(draft.id, draft);
    return draft;
  }

  const { data, error } = await supabase
    .from("pricing_market_prices")
    .insert({
      id: draft.id,
      pricing_catalog_id: draft.pricingCatalogId,
      market_id: draft.marketId,
      currency: draft.currency,
      price_type: draft.priceType,
      price: draft.price,
      is_active: draft.isActive,
      effective_at: draft.effectiveAt,
    })
    .select("*")
    .single();

  if (error || !data) {
    if (error?.code === "23505") throw new MarketPriceConflictError(draft.pricingCatalogId, draft.marketId);
    throw new Error(`[pricing_market_prices] createPricingMarketPrice failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`);
  }

  return rowToPricingMarketPrice(data as PricingMarketPriceRow);
}

/** `pricingCatalogId`/`marketId`/`currency` are never touched here — see
 *  updatePricingMarketPriceSchema's doc comment. */
export async function updatePricingMarketPrice(
  id: string,
  patch: UpdatePricingMarketPriceInput
): Promise<PricingMarketPrice> {
  const current = await getPricingMarketPriceById(id);
  if (!current) throw new MarketPriceNotFoundError(id);

  const updated: PricingMarketPrice = {
    ...current,
    priceType: patch.priceType !== undefined ? patch.priceType : current.priceType,
    price: patch.price !== undefined ? patch.price : current.price,
    isActive: patch.isActive !== undefined ? patch.isActive : current.isActive,
    updatedAt: nowIso(),
  };

  const supabase = getSupabaseAdmin();

  if (!supabase) {
    marketPriceStore.set(id, updated);
    return updated;
  }

  const { data, error } = await supabase
    .from("pricing_market_prices")
    .update({ price_type: updated.priceType, price: updated.price, is_active: updated.isActive })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`[pricing_market_prices] updatePricingMarketPrice failed: ${error?.code ?? "unknown"} ${error?.message ?? ""}`);
  }

  return rowToPricingMarketPrice(data as PricingMarketPriceRow);
}

export async function setPricingMarketPriceActive(id: string, isActive: boolean): Promise<PricingMarketPrice> {
  return updatePricingMarketPrice(id, { isActive });
}
