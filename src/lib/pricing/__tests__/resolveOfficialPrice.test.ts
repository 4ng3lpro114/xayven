import { describe, it, expect } from "vitest";
import { resolveOfficialPrice } from "@/lib/pricing/resolveOfficialPrice";
import { createPricingMarket, createPricingMarketPrice, setPricingMarketPriceActive } from "@/lib/db/pricingMarketStore";
import { getPricingCatalogItemBySlug } from "@/lib/db/pricingCatalogStore";
import { recordExchangeRate } from "@/lib/db/exchangeRateStore";
import { DEFAULT_FALLBACK_MARKET_CODE } from "@/lib/pricing/market/types";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment — both
// pricingCatalogStore and pricingMarketStore use their in-memory fallback.

describe("resolveOfficialPrice — Phase B", () => {
  it("itemSlug inexistente → unavailable, currency COP, nunca lanza", async () => {
    const result = await resolveOfficialPrice({ itemSlug: "no-existe", market: DEFAULT_FALLBACK_MARKET_CODE });
    expect(result).toMatchObject({ source: "unavailable", amount: null, currency: "COP" });
  });

  it("market code inexistente → unavailable, currency del item base, nunca lanza", async () => {
    const result = await resolveOfficialPrice({ itemSlug: "start", market: "NO-EXISTE" });
    expect(result).toMatchObject({ source: "unavailable", amount: null, currency: "COP" });
  });

  it("mercado 'OTHER' (seed) sin precio de mercado propio → BASE_REFERENCE (Phase D) → precio base COP ya público, nunca 'unavailable'", async () => {
    const item = await getPricingCatalogItemBySlug("start");
    const result = await resolveOfficialPrice({ itemSlug: "start", market: DEFAULT_FALLBACK_MARKET_CODE });
    expect(result).toMatchObject({ source: "base_reference", amount: item!.basePrice, currency: item!.currency });
  });

  it("mercado con fallbackBehavior=BASE_REFERENCE y sin precio propio → precio base COP, etiquetado como referencia", async () => {
    const market = await createPricingMarket({
      code: `REF-${Date.now()}`,
      name: "Base reference test",
      currency: "COP",
      conversionAllowed: false,
      fallbackBehavior: "BASE_REFERENCE",
      isActive: true,
    });
    const item = await getPricingCatalogItemBySlug("start");
    const result = await resolveOfficialPrice({ itemSlug: "start", market: market.code });
    expect(result).toMatchObject({
      source: "base_reference",
      amount: item!.basePrice,
      currency: item!.currency,
      priceType: item!.priceType,
    });
  });

  it("mercado con un precio de mercado activo → devuelve exactamente ese precio, source='market_price'", async () => {
    const market = await createPricingMarket({
      code: `OFFICIAL-${Date.now()}`,
      name: "Official price test",
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
    const result = await resolveOfficialPrice({ itemSlug: "start", market: market.code });
    expect(result).toMatchObject({
      source: "market_price",
      amount: 399,
      currency: "USD",
      priceType: "FIXED",
      marketCode: market.code,
    });
    expect(result.effectiveAt).toBeTruthy();
  });

  it("dos mercados distintos en la MISMA moneda pueden tener precios oficiales distintos (regla comercial central)", async () => {
    const marketA = await createPricingMarket({
      code: `USD-A-${Date.now()}`,
      name: "USD market A",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const marketB = await createPricingMarket({
      code: `USD-B-${Date.now()}`,
      name: "USD market B",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const item = await getPricingCatalogItemBySlug("professional");
    await createPricingMarketPrice({
      pricingCatalogId: item!.id,
      marketId: marketA.id,
      currency: "USD",
      priceType: "FIXED",
      price: 799,
      isActive: true,
    });
    await createPricingMarketPrice({
      pricingCatalogId: item!.id,
      marketId: marketB.id,
      currency: "USD",
      priceType: "FIXED",
      price: 899,
      isActive: true,
    });

    const resultA = await resolveOfficialPrice({ itemSlug: "professional", market: marketA.code });
    const resultB = await resolveOfficialPrice({ itemSlug: "professional", market: marketB.code });
    expect(resultA.amount).toBe(799);
    expect(resultB.amount).toBe(899);
    expect(resultA.currency).toBe(resultB.currency); // misma moneda...
    expect(resultA.amount).not.toBe(resultB.amount); // ...precio oficial distinto
  });

  it("precio de mercado desactivado → se ignora, cae a la política de fallback del mercado", async () => {
    const market = await createPricingMarket({
      code: `INACTIVE-PRICE-${Date.now()}`,
      name: "Inactive price test",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const item = await getPricingCatalogItemBySlug("business");
    const created = await createPricingMarketPrice({
      pricingCatalogId: item!.id,
      marketId: market.id,
      currency: "USD",
      priceType: "FIXED",
      price: 1299,
      isActive: true,
    });
    await setPricingMarketPriceActive(created.id, false);

    const result = await resolveOfficialPrice({ itemSlug: "business", market: market.code });
    expect(result.source).toBe("unavailable"); // QUOTE_ONLY, precio desactivado no cuenta
    expect(result.amount).toBeNull();
  });

  it("mercado con conversionAllowed=true, sin precio propio y sin tasa de cambio registrada → cae a fallback_behavior (QUOTE_ONLY → unavailable), nunca inventa", async () => {
    const market = await createPricingMarket({
      code: `CONV-STUB-${Date.now()}`,
      name: "Conversion stub test",
      currency: "USD",
      conversionAllowed: true,
      fallbackBehavior: "QUOTE_ONLY", // sin tasa disponible → conversión falla → cae aquí
      isActive: true,
    });
    const result = await resolveOfficialPrice({ itemSlug: "start", market: market.code });
    expect(result).toMatchObject({ source: "unavailable", amount: null, currency: "USD" });
  });

  it("mercado inactivo → tratado igual que inexistente, nunca expone un precio oficial 'apagado'", async () => {
    const market = await createPricingMarket({
      code: `OFF-${Date.now()}`,
      name: "Deactivated market test",
      currency: "COP",
      conversionAllowed: false,
      fallbackBehavior: "BASE_REFERENCE",
      isActive: false,
    });
    const result = await resolveOfficialPrice({ itemSlug: "start", market: market.code });
    expect(result.source).toBe("unavailable");
  });
});

describe("resolveOfficialPrice — Phase C, tier de conversión determinista", () => {
  // Orden intencional: el caso "sin tasa disponible" va PRIMERO en este
  // describe, antes de que cualquier otra prueba registre una tasa USD en
  // el store en memoria compartido de este archivo — igual que ya se
  // advierte al inicio del archivo.
  it("conversionAllowed=true pero sin tasa disponible + fallbackBehavior=BASE_REFERENCE → cae a la referencia base, nunca 'unavailable' sin más ni un número inventado", async () => {
    const market = await createPricingMarket({
      code: `CONV-FALLTHROUGH-${Date.now()}`,
      name: "Conversion falls through to base reference",
      currency: "USD",
      conversionAllowed: true,
      fallbackBehavior: "BASE_REFERENCE",
      isActive: true,
    });
    // NO se registra ninguna tasa para esta prueba — la conversión debe
    // fallar limpiamente y ceder el paso a fallback_behavior.
    const item = await getPricingCatalogItemBySlug("custom");
    const result = await resolveOfficialPrice({ itemSlug: "custom", market: market.code });
    expect(result.source).toBe("base_reference");
    expect(result.amount).toBe(item!.basePrice);
    expect(result.currency).toBe(item!.currency); // COP — la referencia base, nunca convertida a medias
  });

  it("mercado con conversionAllowed=true + tasa fresca + config de redondeo → source='converted', monto calculado, nunca un precio de mercado inventado", async () => {
    const market = await createPricingMarket({
      code: `CONV-OK-${Date.now()}`,
      name: "Conversion works test",
      currency: "USD",
      conversionAllowed: true,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const rate = await recordExchangeRate({ quoteCurrency: "USD", rate: 0.00025, source: "resolver-e2e-test" });
    const item = await getPricingCatalogItemBySlug("start"); // basePrice 799_000 COP

    const result = await resolveOfficialPrice({ itemSlug: "start", market: market.code });
    expect(result.source).toBe("converted");
    expect(result.amount).toBe(200); // 799_000 * 0.00025 = 199.75 → redondeo USD (unit=1) → 200
    expect(result.currency).toBe("USD");
    expect(result.effectiveAt).toBe(rate.fetchedAt);
    expect(result.priceType).toBe(item!.priceType);
  });

  it("un precio de mercado explícito SIEMPRE gana sobre la conversión, aunque conversionAllowed=true y exista tasa", async () => {
    const market = await createPricingMarket({
      code: `CONV-VS-OFFICIAL-${Date.now()}`,
      name: "Market price wins over conversion",
      currency: "USD",
      conversionAllowed: true,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    await recordExchangeRate({ quoteCurrency: "USD", rate: 0.00025, source: "resolver-precedence-test" });
    const item = await getPricingCatalogItemBySlug("professional");
    await createPricingMarketPrice({
      pricingCatalogId: item!.id,
      marketId: market.id,
      currency: "USD",
      priceType: "FIXED",
      price: 399, // deliberadamente distinto de lo que daría la conversión
      isActive: true,
    });

    const result = await resolveOfficialPrice({ itemSlug: "professional", market: market.code });
    expect(result.source).toBe("market_price");
    expect(result.amount).toBe(399);
  });
});
