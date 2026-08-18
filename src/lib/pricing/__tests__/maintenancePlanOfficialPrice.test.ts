import { describe, it, expect } from "vitest";
import { resolveMaintenancePlanOfficialPrice } from "@/lib/pricing/maintenancePlanOfficialPrice";
import { createPricingMarket, createPricingMarketPrice } from "@/lib/db/pricingMarketStore";
import { getPricingCatalogItemBySlug } from "@/lib/db/pricingCatalogStore";
import { DEFAULT_FALLBACK_MARKET_CODE } from "@/lib/pricing/market/types";

const LABELS = { perMonthSuffix: "/mes", priceUnavailable: "Consultar" };

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY en el entorno de pruebas.

describe("resolveMaintenancePlanOfficialPrice — Maintenance usa Pricing Core vía el resolver, nunca una tabla paralela", () => {
  it("slug inexistente → priceUnavailable, sin nombre, sin features, nunca inventa", async () => {
    const result = await resolveMaintenancePlanOfficialPrice("no-existe", DEFAULT_FALLBACK_MARKET_CODE, "es", LABELS, "COP");
    expect(result).toEqual({ displayName: null, priceLabel: "Consultar", features: [] });
  });

  it("mercado 'OTHER' (BASE_REFERENCE) → precio base COP ya público, nombre y features reales de Pricing Core", async () => {
    const item = await getPricingCatalogItemBySlug("essential");
    const result = await resolveMaintenancePlanOfficialPrice("essential", DEFAULT_FALLBACK_MARKET_CODE, "es", LABELS, "COP");
    expect(result.displayName).toBe("Essential");
    expect(result.priceLabel).toContain("/mes");
    expect(result.priceLabel).toContain(item!.basePrice.toLocaleString("es-CO"));
    expect(result.features).toEqual(item!.features.es);
  });

  it("mercado con precio oficial propio → usa ESE monto, no el base COP", async () => {
    const market = await createPricingMarket({
      code: `MAINT-OFFICIAL-${Date.now()}`,
      name: "Maintenance official price market",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const item = await getPricingCatalogItemBySlug("growth");
    await createPricingMarketPrice({
      pricingCatalogId: item!.id,
      marketId: market.id,
      currency: "USD",
      priceType: "FIXED",
      price: 29,
      isActive: true,
    });

    const result = await resolveMaintenancePlanOfficialPrice("growth", market.code, "es", LABELS, "USD");
    expect(result.priceLabel).toContain("29");
    expect(result.priceLabel).toContain("USD");
    expect(result.displayName).toBe("Growth");
  });

  it("mercado sin precio propio y QUOTE_ONLY → priceUnavailable, pero nombre/features SÍ se muestran (Pricing Core sigue siendo la fuente editorial)", async () => {
    const market = await createPricingMarket({
      code: `MAINT-QUOTE-${Date.now()}`,
      name: "Maintenance quote-only market",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const item = await getPricingCatalogItemBySlug("care-plus");
    const result = await resolveMaintenancePlanOfficialPrice("care-plus", market.code, "es", LABELS, "USD");
    expect(result.priceLabel).toBe("Consultar");
    expect(result.displayName).toBe("Care+");
    expect(result.features).toEqual(item!.features.es);
  });

  it("ES y EN devuelven las MISMAS cifras y el mismo nombre, features en el idioma correcto, sin contaminación cruzada", async () => {
    const es = await resolveMaintenancePlanOfficialPrice("essential", DEFAULT_FALLBACK_MARKET_CODE, "es", LABELS, "COP");
    const en = await resolveMaintenancePlanOfficialPrice(
      "essential",
      DEFAULT_FALLBACK_MARKET_CODE,
      "en",
      { perMonthSuffix: "/mo", priceUnavailable: "Get a quote" },
      "COP"
    );
    expect(es.displayName).toBe(en.displayName); // "Essential" es igual en ambos, nombre oficial
    // Mismo monto numérico en ambos labels (solo cambia el sufijo de idioma).
    const item = await getPricingCatalogItemBySlug("essential");
    expect(es.priceLabel).toContain(item!.basePrice.toLocaleString("es-CO"));
    expect(en.priceLabel).toContain(item!.basePrice.toLocaleString("es-CO"));
    expect(es.priceLabel).toContain("/mes");
    expect(en.priceLabel).toContain("/mo");
    // Features en el idioma correcto, nunca mezcladas.
    expect(es.features).toEqual(item!.features.es);
    expect(en.features).toEqual(item!.features.en);
    expect(es.features).not.toEqual(en.features);
  });
});

describe("resolveMaintenancePlanOfficialPrice — Display Currency (Phase D): displayCurrency SOLO cambia la presentación, nunca el mercado ni el precio oficial", () => {
  it("mercado con precio oficial en USD + displayCurrency COP con tasa fresca → precio convertido, mismo mercado", async () => {
    const { recordExchangeRate } = await import("@/lib/db/exchangeRateStore");
    await recordExchangeRate({ quoteCurrency: "USD", rate: 0.00025, source: "maint-display-test" });

    const market = await createPricingMarket({
      code: `MAINT-DISPLAY-${Date.now()}`,
      name: "Maintenance display-currency market",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const item = await getPricingCatalogItemBySlug("growth");
    await createPricingMarketPrice({
      pricingCatalogId: item!.id,
      marketId: market.id,
      currency: "USD",
      priceType: "FIXED",
      price: 29,
      isActive: true,
    });

    const inUsd = await resolveMaintenancePlanOfficialPrice("growth", market.code, "es", LABELS, "USD");
    const inCop = await resolveMaintenancePlanOfficialPrice("growth", market.code, "es", LABELS, "COP");

    expect(inUsd.priceLabel).toContain("29");
    expect(inUsd.priceLabel).toContain("USD");
    // 29 USD / 0.00025 = 116_000 COP — el equivalente, nunca el precio base
    // colombiano de Pricing Core (que es un número totalmente distinto).
    expect(inCop.priceLabel).toContain("116.000");
    expect(inCop.priceLabel).toContain("COP");
    expect(inCop.displayName).toBe(inUsd.displayName); // mismo plan, mismo mercado
  });

  it("displayCurrency sin tasa disponible → cae al precio oficial en su propia moneda, nunca inventa ni rompe", async () => {
    const market = await createPricingMarket({
      code: `MAINT-NORATE-${Date.now()}`,
      name: "Maintenance no-rate market",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const item = await getPricingCatalogItemBySlug("care-plus");
    await createPricingMarketPrice({
      pricingCatalogId: item!.id,
      marketId: market.id,
      currency: "USD",
      priceType: "FIXED",
      price: 79,
      isActive: true,
    });

    // "GBP" no tiene currency_config ni exchange_rates sembrados en este
    // entorno de pruebas — conversión imposible, debe degradar limpio.
    const result = await resolveMaintenancePlanOfficialPrice("care-plus", market.code, "es", LABELS, "GBP");
    expect(result.priceLabel).toContain("79");
    expect(result.priceLabel).toContain("USD");
  });
});
