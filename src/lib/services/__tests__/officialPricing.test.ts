import { describe, it, expect } from "vitest";
import { resolveServiceOfficialPriceSummary, resolveOfficialPricesBySlug } from "@/lib/services/officialPricing";
import { formatServicePriceLabel } from "@/lib/services/pricingSummary";
import { createPricingMarket, createPricingMarketPrice } from "@/lib/db/pricingMarketStore";
import { getPricingCatalogItemBySlug } from "@/lib/db/pricingCatalogStore";
import { DEFAULT_FALLBACK_MARKET_CODE } from "@/lib/pricing/market/types";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment.

describe("resolveServiceOfficialPriceSummary — Services usa Pricing Core vía el resolver, nunca una tabla paralela", () => {
  it("mercado 'OTHER' (BASE_REFERENCE) sin package relacionado → 'quote'", async () => {
    const summary = await resolveServiceOfficialPriceSummary([], DEFAULT_FALLBACK_MARKET_CODE);
    expect(summary.kind).toBe("quote");
  });

  it("un solo package FIXED disponible en el mercado → kind='fixed', monto oficial exacto", async () => {
    const market = await createPricingMarket({
      code: `SVC-FIXED-${Date.now()}`,
      name: "Single fixed package market",
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

    const summary = await resolveServiceOfficialPriceSummary(["start"], market.code);
    expect(summary).toEqual({ kind: "fixed", amount: 399, currency: "USD", itemSlug: "start", marketCode: market.code });
  });

  it("varios packages relacionados → 'from' con el más barato, aunque todos sean FIXED", async () => {
    const market = await createPricingMarket({
      code: `SVC-MULTI-${Date.now()}`,
      name: "Multi package market",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const start = await getPricingCatalogItemBySlug("start");
    const pro = await getPricingCatalogItemBySlug("professional");
    await createPricingMarketPrice({ pricingCatalogId: start!.id, marketId: market.id, currency: "USD", priceType: "FIXED", price: 399, isActive: true });
    await createPricingMarketPrice({ pricingCatalogId: pro!.id, marketId: market.id, currency: "USD", priceType: "FIXED", price: 799, isActive: true });

    const summary = await resolveServiceOfficialPriceSummary(["start", "professional"], market.code);
    expect(summary).toEqual({ kind: "from", amount: 399, currency: "USD", itemSlug: "start", marketCode: market.code });
  });

  it("kind='quote' produce el label de cotización del diccionario, nunca un número — formatServicePriceLabel() reutilizado sin cambios", () => {
    const label = formatServicePriceLabel({ kind: "quote" }, { priceFrom: "Desde", priceQuote: "Cotizar" });
    expect(label).toBe("Cotizar");
  });
});

describe("resolveOfficialPricesBySlug — resolución en lote para las tarjetas de precio de un servicio", () => {
  it("devuelve un Map indexado por slug con el resultado oficial de cada uno", async () => {
    const market = await createPricingMarket({
      code: `SVC-BULK-${Date.now()}`,
      name: "Bulk resolution market",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const start = await getPricingCatalogItemBySlug("start");
    await createPricingMarketPrice({ pricingCatalogId: start!.id, marketId: market.id, currency: "USD", priceType: "FIXED", price: 399, isActive: true });

    const map = await resolveOfficialPricesBySlug(["start", "business"], market.code);
    expect(map.get("start")).toMatchObject({ source: "market_price", amount: 399 });
    expect(map.get("business")).toBeDefined(); // sin precio propio en este mercado, pero nunca ausente del Map
    expect(map.size).toBe(2);
  });
});

describe("dos mercados en la MISMA moneda, precios de Services independientes (mismo requisito ya probado a nivel resolver, verificado aquí a nivel Services)", () => {
  it("el mismo slug tiene precios oficiales distintos según el mercado", async () => {
    const marketA = await createPricingMarket({
      code: `SVC-USD-A-${Date.now()}`,
      name: "USD market A",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const marketB = await createPricingMarket({
      code: `SVC-USD-B-${Date.now()}`,
      name: "USD market B",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const item = await getPricingCatalogItemBySlug("business");
    await createPricingMarketPrice({ pricingCatalogId: item!.id, marketId: marketA.id, currency: "USD", priceType: "FIXED", price: 999, isActive: true });
    await createPricingMarketPrice({ pricingCatalogId: item!.id, marketId: marketB.id, currency: "USD", priceType: "FIXED", price: 1099, isActive: true });

    const summaryA = await resolveServiceOfficialPriceSummary(["business"], marketA.code);
    const summaryB = await resolveServiceOfficialPriceSummary(["business"], marketB.code);
    expect(summaryA.amount).toBe(999);
    expect(summaryB.amount).toBe(1099);
    expect(summaryA.currency).toBe(summaryB.currency);
  });
});
