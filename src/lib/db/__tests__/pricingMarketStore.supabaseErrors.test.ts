import { describe, it, expect, vi } from "vitest";

/**
 * Isolated in its own file — same reasoning as
 * contactRequestStore.supabaseErrors.test.ts: mocking getSupabaseAdmin()
 * would otherwise interfere with the real in-memory round-trips exercised
 * by pricingMarketStore.test.ts. Never touches real Supabase.
 *
 * Regression test for a REAL bug caught during Phase D's live
 * verification (not hypothetical): this project's dev environment has a
 * real SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY configured, but the
 * International Pricing migrations (0021+) — like 0014-0020 before them —
 * are written but NOT YET APPLIED to that database. Every query in this
 * store's Supabase branch against those not-yet-existing tables returns
 * `{data: null, error: {...}}` (PostgREST "relation does not exist").
 * Before this fix, getMarketForCountry()/resolveCommercialMarket() threw
 * when even the 'OTHER' seed came back empty this way, which crashed
 * every public page with a 500. This test locks in the fix: it must
 * degrade to HARDCODED_FALLBACK_MARKET instead, always.
 */
function makeFakeSupabaseAllEmpty() {
  const emptyResult = async () => ({ data: null, error: { code: "42P01", message: "relation does not exist" } });
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    maybeSingle: emptyResult,
    single: emptyResult,
  };
  return { from: () => chain };
}

describe("pricingMarketStore — tablas de International Pricing todavía no existen en Supabase (migraciones sin aplicar)", () => {
  it("getMarketForCountry() NUNCA lanza — degrada al mercado hardcodeado en COP, nunca crashea la página", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/supabase", () => ({ getSupabaseAdmin: () => makeFakeSupabaseAllEmpty() }));

    const { getMarketForCountry } = await import("@/lib/db/pricingMarketStore");
    const { DEFAULT_FALLBACK_MARKET_CODE } = await import("@/lib/pricing/market/types");

    const market = await getMarketForCountry("US");
    expect(market.code).toBe(DEFAULT_FALLBACK_MARKET_CODE);
    expect(market.currency).toBe("COP");
    expect(market.fallbackBehavior).toBe("BASE_REFERENCE");

    vi.doUnmock("@/lib/db/supabase");
  });

  it("getPricingMarketByCode() devuelve null limpiamente (no lanza) cuando la tabla no existe todavía", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/supabase", () => ({ getSupabaseAdmin: () => makeFakeSupabaseAllEmpty() }));

    const { getPricingMarketByCode } = await import("@/lib/db/pricingMarketStore");
    expect(await getPricingMarketByCode("OTHER")).toBeNull();

    vi.doUnmock("@/lib/db/supabase");
  });
});
