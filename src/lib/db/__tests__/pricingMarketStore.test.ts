import { describe, it, expect } from "vitest";
import {
  listPricingMarkets,
  getPricingMarketByCode,
  getPricingMarketById,
  createPricingMarket,
  updatePricingMarket,
  setPricingMarketActive,
  PricingMarketNotFoundError,
  PricingMarketCodeConflictError,
  listMarketCountries,
  getMarketCountry,
  setMarketCountry,
  removeMarketCountry,
  getMarketForCountry,
  listPricingMarketPrices,
  getPricingMarketPrice,
  createPricingMarketPrice,
  updatePricingMarketPrice,
  setPricingMarketPriceActive,
  MarketPriceNotFoundError,
  MarketPriceConflictError,
  MarketCurrencyMismatchError,
} from "@/lib/db/pricingMarketStore";
import { getPricingCatalogItemBySlug } from "@/lib/db/pricingCatalogStore";
import { DEFAULT_FALLBACK_MARKET_CODE } from "@/lib/pricing/market/types";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// pricingMarketStore.ts transparently uses its in-memory fallback — same
// pattern as pricingCatalogStore.test.ts.

describe("pricingMarketStore — pricing_markets", () => {
  it("seeds exactly the 'OTHER' safety-net market, no international commercial price seeded (Phase A Regla 11)", async () => {
    const markets = await listPricingMarkets();
    const other = markets.find((m) => m.code === DEFAULT_FALLBACK_MARKET_CODE);
    expect(other).toBeDefined();
    expect(other).toMatchObject({
      code: "OTHER",
      currency: "COP",
      conversionAllowed: false,
      // Phase D: BASE_REFERENCE, not QUOTE_ONLY — 'OTHER' is COP, so this
      // just shows the already-public pricing_catalog base price, never a
      // new international price. See pricingMarketStore.ts's doc comment.
      fallbackBehavior: "BASE_REFERENCE",
      isActive: true,
    });
  });

  it("código inexistente → null, nunca lanza", async () => {
    expect(await getPricingMarketByCode("NO-EXISTE")).toBeNull();
  });

  it("crea un mercado nuevo con code único", async () => {
    const market = await createPricingMarket({
      code: `US-${Date.now()}`,
      name: "United States",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    expect(market.id).toBeTruthy();
    const found = await getPricingMarketByCode(market.code);
    expect(found).toEqual(market);
  });

  it("code duplicado → PricingMarketCodeConflictError", async () => {
    const code = `DUP-${Date.now()}`;
    await createPricingMarket({
      code,
      name: "Duplicate test",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    await expect(
      createPricingMarket({
        code,
        name: "Duplicate test 2",
        currency: "USD",
        conversionAllowed: false,
        fallbackBehavior: "QUOTE_ONLY",
        isActive: true,
      })
    ).rejects.toBeInstanceOf(PricingMarketCodeConflictError);
  });

  it("update nunca modifica el code (inmutable tras creación)", async () => {
    const market = await createPricingMarket({
      code: `IMM-${Date.now()}`,
      name: "Immutable code test",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const updated = await updatePricingMarket(market.id, { name: "Renamed", conversionAllowed: true });
    expect(updated.code).toBe(market.code);
    expect(updated.name).toBe("Renamed");
    expect(updated.conversionAllowed).toBe(true);
  });

  it("update de id inexistente → PricingMarketNotFoundError", async () => {
    await expect(updatePricingMarket("no-existe", { name: "x" })).rejects.toBeInstanceOf(PricingMarketNotFoundError);
  });

  it("setPricingMarketActive desactiva sin borrar (soft-state)", async () => {
    const market = await createPricingMarket({
      code: `DEACT-${Date.now()}`,
      name: "Deactivate test",
      currency: "COP",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const deactivated = await setPricingMarketActive(market.id, false);
    expect(deactivated.isActive).toBe(false);
    // Sigue siendo consultable — nunca desaparece.
    expect(await getPricingMarketById(market.id)).toMatchObject({ isActive: false });
  });
});

describe("pricingMarketStore — market_countries (enrutamiento país → mercado)", () => {
  it("país sin fila → getMarketCountry() null, pero getMarketForCountry() cae a 'OTHER'", async () => {
    expect(await getMarketCountry("ZZ")).toBeNull();
    const market = await getMarketForCountry("ZZ");
    expect(market.code).toBe(DEFAULT_FALLBACK_MARKET_CODE);
  });

  it("enruta un país a un mercado real y getMarketForCountry() lo respeta", async () => {
    const us = await createPricingMarket({
      code: `US-ROUTE-${Date.now()}`,
      name: "United States",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    await setMarketCountry("UZ", us.id);
    const resolved = await getMarketForCountry("UZ");
    expect(resolved.id).toBe(us.id);
  });

  it("mercado destino inexistente → PricingMarketNotFoundError, nunca crea la ruta", async () => {
    await expect(setMarketCountry("XX", "no-existe")).rejects.toBeInstanceOf(PricingMarketNotFoundError);
  });

  it("país enrutado a un mercado que luego se desactiva → getMarketForCountry() cae a 'OTHER'", async () => {
    const market = await createPricingMarket({
      code: `INACTIVE-${Date.now()}`,
      name: "Will be deactivated",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    await setMarketCountry("YY", market.id);
    await setPricingMarketActive(market.id, false);
    const resolved = await getMarketForCountry("YY");
    expect(resolved.code).toBe(DEFAULT_FALLBACK_MARKET_CODE);
  });

  it("removeMarketCountry() nunca lanza aunque no exista la ruta", async () => {
    await expect(removeMarketCountry("NOPE")).resolves.toBeUndefined();
  });

  it("removeMarketCountry() hace que el país vuelva a resolver a 'OTHER'", async () => {
    const market = await createPricingMarket({
      code: `REMOVE-${Date.now()}`,
      name: "Remove route test",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    await setMarketCountry("WW", market.id);
    expect((await getMarketForCountry("WW")).id).toBe(market.id);
    await removeMarketCountry("WW");
    expect((await getMarketForCountry("WW")).code).toBe(DEFAULT_FALLBACK_MARKET_CODE);
  });

  it("listMarketCountries() incluye las rutas creadas", async () => {
    const market = await createPricingMarket({
      code: `LIST-${Date.now()}`,
      name: "List test",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    await setMarketCountry("VV", market.id);
    const routes = await listMarketCountries();
    expect(routes.some((r) => r.countryCode === "VV" && r.marketId === market.id)).toBe(true);
  });
});

describe("pricingMarketStore — pricing_market_prices", () => {
  it("currency que no coincide con la del mercado → MarketCurrencyMismatchError, nunca crea la fila", async () => {
    const market = await createPricingMarket({
      code: `CURMISMATCH-${Date.now()}`,
      name: "Currency mismatch test",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const item = await getPricingCatalogItemBySlug("start");
    await expect(
      createPricingMarketPrice({
        pricingCatalogId: item!.id,
        marketId: market.id,
        currency: "COP", // el mercado es USD — debe rechazarse
        priceType: "FIXED",
        price: 399,
        isActive: true,
      })
    ).rejects.toBeInstanceOf(MarketCurrencyMismatchError);
  });

  it("crea un precio oficial de mercado y lo puede leer de vuelta", async () => {
    const market = await createPricingMarket({
      code: `PRICE-OK-${Date.now()}`,
      name: "Price OK test",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const item = await getPricingCatalogItemBySlug("start");
    const created = await createPricingMarketPrice({
      pricingCatalogId: item!.id,
      marketId: market.id,
      currency: "USD",
      priceType: "FIXED",
      price: 399,
      isActive: true,
    });
    expect(created.price).toBe(399);
    const found = await getPricingMarketPrice(item!.id, market.id);
    expect(found).toEqual(created);
  });

  it("mismo (item, mercado) dos veces → MarketPriceConflictError", async () => {
    const market = await createPricingMarket({
      code: `PRICE-DUP-${Date.now()}`,
      name: "Price dup test",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const item = await getPricingCatalogItemBySlug("start");
    await createPricingMarketPrice({
      pricingCatalogId: item!.id,
      marketId: market.id,
      currency: "USD",
      priceType: "FIXED",
      price: 399,
      isActive: true,
    });
    await expect(
      createPricingMarketPrice({
        pricingCatalogId: item!.id,
        marketId: market.id,
        currency: "USD",
        priceType: "FIXED",
        price: 450,
        isActive: true,
      })
    ).rejects.toBeInstanceOf(MarketPriceConflictError);
  });

  it("update nunca cambia pricingCatalogId/marketId/currency, solo price/priceType/isActive", async () => {
    const market = await createPricingMarket({
      code: `PRICE-UPD-${Date.now()}`,
      name: "Price update test",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const item = await getPricingCatalogItemBySlug("start");
    const created = await createPricingMarketPrice({
      pricingCatalogId: item!.id,
      marketId: market.id,
      currency: "USD",
      priceType: "FIXED",
      price: 399,
      isActive: true,
    });
    const updated = await updatePricingMarketPrice(created.id, { price: 429 });
    expect(updated.price).toBe(429);
    expect(updated.pricingCatalogId).toBe(item!.id);
    expect(updated.marketId).toBe(market.id);
    expect(updated.currency).toBe("USD");
  });

  it("update de id inexistente → MarketPriceNotFoundError", async () => {
    await expect(updatePricingMarketPrice("no-existe", { price: 1 })).rejects.toBeInstanceOf(MarketPriceNotFoundError);
  });

  it("setPricingMarketPriceActive desactiva sin borrar", async () => {
    const market = await createPricingMarket({
      code: `PRICE-DEACT-${Date.now()}`,
      name: "Price deactivate test",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const item = await getPricingCatalogItemBySlug("professional");
    const created = await createPricingMarketPrice({
      pricingCatalogId: item!.id,
      marketId: market.id,
      currency: "USD",
      priceType: "FIXED",
      price: 799,
      isActive: true,
    });
    const deactivated = await setPricingMarketPriceActive(created.id, false);
    expect(deactivated.isActive).toBe(false);
  });

  it("listPricingMarketPrices() filtra por pricingCatalogId/marketId/activeOnly", async () => {
    const market = await createPricingMarket({
      code: `PRICE-LIST-${Date.now()}`,
      name: "Price list test",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const item = await getPricingCatalogItemBySlug("business");
    await createPricingMarketPrice({
      pricingCatalogId: item!.id,
      marketId: market.id,
      currency: "USD",
      priceType: "FIXED",
      price: 999,
      isActive: true,
    });
    const byItem = await listPricingMarketPrices({ pricingCatalogId: item!.id });
    expect(byItem.some((p) => p.marketId === market.id)).toBe(true);
    const byMarket = await listPricingMarketPrices({ marketId: market.id });
    expect(byMarket).toHaveLength(1);
  });
});
