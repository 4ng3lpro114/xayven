import { describe, it, expect, beforeAll } from "vitest";
import { resolveGroupMemberPrices, isGroupedMarket } from "@/lib/pricing/marketSync";
import { withDisplayPrice, resolveSynchronizedDisplayPrice } from "@/lib/pricing/displayPrice";
import { createPricingMarket, createPricingMarketPrice } from "@/lib/db/pricingMarketStore";
import { getPricingCatalogItemBySlug } from "@/lib/db/pricingCatalogStore";
import { recordExchangeRate } from "@/lib/db/exchangeRateStore";
import { setCurrencyConfig } from "@/lib/db/currencyConfigStore";
import type { PricingMarket } from "@/lib/pricing/market/types";
import type { OfficialPriceResult } from "@/lib/pricing/market/types";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment — all
// stores touched here use their in-memory fallback, isolated per test
// file (see vitest.config.mts). 'US'/'EU' are real, hardcoded codes in
// MARKET_SIBLING_GROUPS (marketSync.ts) — these tests create real markets
// under those exact codes to exercise the actual production grouping,
// not a test-only stand-in.

function official(overrides: Partial<OfficialPriceResult> = {}): OfficialPriceResult {
  return {
    itemSlug: "start",
    marketCode: "US",
    currency: "USD",
    amount: 427,
    priceType: "FIXED",
    billingInterval: "ONE_TIME",
    source: "market_price",
    effectiveAt: new Date().toISOString(),
    ...overrides,
  };
}

let usMarket: PricingMarket;
let euMarket: PricingMarket;

beforeAll(async () => {
  usMarket = await createPricingMarket({
    code: "US",
    name: "United States",
    currency: "USD",
    conversionAllowed: false,
    fallbackBehavior: "QUOTE_ONLY",
    isActive: true,
  });
  euMarket = await createPricingMarket({
    code: "EU",
    name: "Europe",
    currency: "EUR",
    conversionAllowed: false,
    fallbackBehavior: "QUOTE_ONLY",
    isActive: true,
  });
});

describe("isGroupedMarket — solo US/EU pertenecen a un sibling group hoy", () => {
  it("US y EU están agrupados; CO/OTHER/cualquier otro código no", () => {
    expect(isGroupedMarket("US")).toBe(true);
    expect(isGroupedMarket("EU")).toBe(true);
    expect(isGroupedMarket("CO")).toBe(false);
    expect(isGroupedMarket("OTHER")).toBe(false);
  });
});

describe("resolveGroupMemberPrices — batching de precios explícitos del grupo", () => {
  it("mercado no agrupado → null, sin ninguna consulta de grupo", async () => {
    const result = await resolveGroupMemberPrices("start", "CO");
    expect(result).toBeNull();
  });

  it("mercado agrupado con precios explícitos en ambos hermanos → Map con ambas monedas", async () => {
    const item = await getPricingCatalogItemBySlug("professional");
    await createPricingMarketPrice({ pricingCatalogId: item!.id, marketId: usMarket.id, currency: "USD", priceType: "FIXED", price: 867, isActive: true });
    await createPricingMarketPrice({ pricingCatalogId: item!.id, marketId: euMarket.id, currency: "EUR", priceType: "FIXED", price: 749, isActive: true });

    const result = await resolveGroupMemberPrices("professional", "US");
    expect(result).not.toBeNull();
    expect(result!.group.canonicalCurrency).toBe("EUR");
    expect(result!.membersByCurrency.get("USD")?.amount).toBe(867);
    expect(result!.membersByCurrency.get("EUR")?.amount).toBe(749);
  });
});

describe("Anti-arbitraje EUR ↔ USD — el intercambio entre hermanos NUNCA pasa por exchange_rates", () => {
  it("US→EUR y EU→USD devuelven el precio explícito propio del hermano, incluso con una tasa de cambio deliberadamente incorrecta sembrada", async () => {
    const item = await getPricingCatalogItemBySlug("business");
    await createPricingMarketPrice({ pricingCatalogId: item!.id, marketId: usMarket.id, currency: "USD", priceType: "FIXED", price: 1619, isActive: true });
    await createPricingMarketPrice({ pricingCatalogId: item!.id, marketId: euMarket.id, currency: "EUR", priceType: "FIXED", price: 1399, isActive: true });

    // Tasa deliberadamente absurda — si el swap alguna vez pasara por
    // exchange_rates, este valor lo delataría inmediatamente.
    await recordExchangeRate({ quoteCurrency: "USD", rate: 999, source: "marketSync-test-decoy" });
    await setCurrencyConfig({ currency: "USD", roundingUnit: 1, decimalPlaces: 2 });

    const usOfficial = official({ itemSlug: "business", marketCode: "US", currency: "USD", amount: 1619 });
    const toEur = await withDisplayPrice(usOfficial, "EUR");
    expect(toEur.amount).toBe(1399); // precio EUR explícito, no derivado de la tasa señuelo
    expect(toEur.currency).toBe("EUR");
    expect(toEur.marketCode).toBe("US"); // el commercial market nunca cambia

    const euOfficial = official({ itemSlug: "business", marketCode: "EU", currency: "EUR", amount: 1399 });
    const toUsd = await withDisplayPrice(euOfficial, "USD");
    expect(toUsd.amount).toBe(1619); // precio USD explícito
    expect(toUsd.currency).toBe("USD");
    expect(toUsd.marketCode).toBe("EU");
  });

  it("round-trip EUR→USD→EUR y USD→EUR→USD es exacto siempre — cada lectura es independiente, nunca una composición aritmética", async () => {
    const item = await getPricingCatalogItemBySlug("ecommerce");
    await createPricingMarketPrice({ pricingCatalogId: item!.id, marketId: usMarket.id, currency: "USD", priceType: "FROM", price: 2659, isActive: true });
    await createPricingMarketPrice({ pricingCatalogId: item!.id, marketId: euMarket.id, currency: "EUR", priceType: "FROM", price: 2299, isActive: true });

    const usOfficial = official({ itemSlug: "ecommerce", marketCode: "US", currency: "USD", amount: 2659 });
    // Simula al visitante alternando el selector varias veces. Cada
    // llamada es una lectura independiente del MISMO `official` — nunca
    // una composición aritmética sobre el resultado anterior — por eso el
    // recorrido completo (EUR→USD→EUR→USD) es exacto en cada paso, sin
    // deriva acumulada.
    const eur1 = await withDisplayPrice(usOfficial, "EUR");
    const usd1 = await withDisplayPrice(usOfficial, "USD");
    const eur2 = await withDisplayPrice(usOfficial, "EUR");
    const usd2 = await withDisplayPrice(usOfficial, "USD");
    expect([eur1.amount, eur2.amount]).toEqual([2299, 2299]);
    expect([usd1.amount, usd2.amount]).toEqual([2659, 2659]);
  });
});

describe("Canonical Anchor — INTERNATIONAL→COP siempre deriva del precio EUR, nunca del USD redondeado", () => {
  it("US official → COP y EU official → COP dan EXACTAMENTE el mismo número, derivado de EUR", async () => {
    const item = await getPricingCatalogItemBySlug("custom");
    await createPricingMarketPrice({ pricingCatalogId: item!.id, marketId: usMarket.id, currency: "USD", priceType: "FROM", price: 4859, isActive: true });
    await createPricingMarketPrice({ pricingCatalogId: item!.id, marketId: euMarket.id, currency: "EUR", priceType: "FROM", price: 4199, isActive: true });

    // Tasa EUR/COP real (anclada a CUSTOM, aprobada); tasa USD/COP
    // deliberadamente ausente — si la conversión intentara pivotar desde
    // USD directamente, fallaría (null) en vez de dar el mismo resultado.
    await recordExchangeRate({ quoteCurrency: "EUR", rate: 1 / 3631.6, source: "marketSync-test-eur-cop" });
    await setCurrencyConfig({ currency: "COP", roundingUnit: 1000, decimalPlaces: 0 });

    const usOfficial = official({ itemSlug: "custom", marketCode: "US", currency: "USD", amount: 4859 });
    const euOfficial = official({ itemSlug: "custom", marketCode: "EU", currency: "EUR", amount: 4199 });

    const usToCop = await withDisplayPrice(usOfficial, "COP");
    const euToCop = await withDisplayPrice(euOfficial, "COP");

    expect(usToCop.amount).not.toBeNull();
    expect(usToCop.amount).toBe(euToCop.amount); // el ancla nunca depende de qué moneda se estaba viendo
    expect(usToCop.amount).toBe(15_249_000); // 4199 * 3631.6 = 15_249_088.40 → redondeado a la unidad COP (1000)
    expect(usToCop.currency).toBe("COP");
    // El Commercial Market original nunca se pierde en el resultado.
    expect(usToCop.marketCode).toBe("US");
    expect(euToCop.marketCode).toBe("EU");
  });

  it("mercado no agrupado (CO) sigue convirtiendo directamente desde su propia moneda oficial — sin cambios de comportamiento", async () => {
    await recordExchangeRate({ quoteCurrency: "USD", rate: 1 / 3138.318254784935, source: "marketSync-test-co-usd" });
    const coOfficial = { itemSlug: "custom", marketCode: "CO", currency: "COP", amount: 6_000_000 };
    const result = await resolveSynchronizedDisplayPrice(coOfficial, "USD");
    expect(result).not.toBeNull();
    // 6_000_000 COP convertido directo — jamás el precio INTERNATIONAL.
    expect(result!.amount).not.toBe(4859);
    expect(result!.amount).toBe(1912); // 6_000_000 * (1/3138.318254784935), redondeado a entero USD
  });
});
