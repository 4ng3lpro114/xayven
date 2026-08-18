import { describe, it, expect } from "vitest";
import { executeGetOfficialPrice, executeToolCall, GET_OFFICIAL_PRICE_TOOL, type PriceToolContext } from "@/lib/ai/tools";
import { createPricingMarket, createPricingMarketPrice, getPricingMarketByCode } from "@/lib/db/pricingMarketStore";
import { recordExchangeRate } from "@/lib/db/exchangeRateStore";
import { getPricingCatalogItemBySlug } from "@/lib/db/pricingCatalogStore";
import { DEFAULT_FALLBACK_MARKET_CODE, HARDCODED_FALLBACK_MARKET } from "@/lib/pricing/market/types";
import type { AIToolCall } from "@/lib/ai/provider";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY en el entorno de pruebas — todos
// los stores tocados aquí usan su fallback en memoria.

async function otherMarketContext(displayCurrency = "COP"): Promise<PriceToolContext> {
  const market = (await getPricingMarketByCode(DEFAULT_FALLBACK_MARKET_CODE)) ?? HARDCODED_FALLBACK_MARKET;
  return { market, displayCurrency, locale: "es" };
}

describe("get_official_price — tool válida, consume resolveOfficialPrice()/withDisplayPrice() sin duplicar lógica", () => {
  it("itemSlug real y activo, mercado 'OTHER' (BASE_REFERENCE) → found:true, precio base COP, source='base_reference'", async () => {
    const context = await otherMarketContext();
    const result = await executeGetOfficialPrice(JSON.stringify({ itemSlug: "start" }), context);

    expect(result.found).toBe(true);
    expect(result.itemSlug).toBe("start");
    expect(result.name).toBe("START");
    expect(result.source).toBe("base_reference");
    expect(result.officialAmount).not.toBeNull();
    expect(result.officialCurrency).toBe("COP");
    expect(result.effectiveAt).not.toBeNull();
    expect(result.commercialMarket).toEqual({ code: "OTHER", name: context.market.name });
  });

  it("item inexistente → found:false, todos los campos de precio en null, nunca lanza", async () => {
    const context = await otherMarketContext();
    const result = await executeGetOfficialPrice(JSON.stringify({ itemSlug: "no-existe-este-slug" }), context);

    expect(result).toEqual({
      itemSlug: "no-existe-este-slug",
      found: false,
      name: null,
      commercialMarket: null,
      officialAmount: null,
      officialCurrency: null,
      displayAmount: null,
      displayCurrency: null,
      isOfficialCurrency: null,
      priceType: null,
      billingInterval: null,
      source: null,
      effectiveAt: null,
      features: null,
    });
  });

  it("arguments malformados (JSON inválido) → found:false, nunca lanza", async () => {
    const context = await otherMarketContext();
    const result = await executeGetOfficialPrice("{not valid json", context);
    expect(result.found).toBe(false);
  });

  it("itemSlug ausente en arguments → found:false, nunca lanza", async () => {
    const context = await otherMarketContext();
    const result = await executeGetOfficialPrice(JSON.stringify({}), context);
    expect(result.found).toBe(false);
  });
});

describe("get_official_price — package (category='package'): sin features, nunca inventadas", () => {
  it("features siempre null para un paquete web, incluso cuando el precio sí resuelve", async () => {
    const context = await otherMarketContext();
    const result = await executeGetOfficialPrice(JSON.stringify({ itemSlug: "professional" }), context);

    expect(result.found).toBe(true);
    expect(result.features).toBeNull();
  });
});

describe("get_official_price — maintenance (category='maintenance'): features reales de Pricing Core", () => {
  it("features es un array real y no vacío para un plan de mantenimiento", async () => {
    const context = await otherMarketContext();
    const result = await executeGetOfficialPrice(JSON.stringify({ itemSlug: "essential" }), context);

    expect(result.found).toBe(true);
    expect(Array.isArray(result.features)).toBe(true);
    expect(result.features!.length).toBeGreaterThan(0);
    expect(result.features).toContain("Actualizaciones técnicas y de seguridad");
  });

  it("locale='en' → features en inglés, nunca mezcladas con español", async () => {
    const context: PriceToolContext = { ...(await otherMarketContext()), locale: "en" };
    const result = await executeGetOfficialPrice(JSON.stringify({ itemSlug: "essential" }), context);

    expect(result.features).not.toContain("Actualizaciones técnicas y de seguridad");
    expect(result.features!.length).toBeGreaterThan(0);
  });
});

describe("get_official_price — market-aware: US vs Colombia ('OTHER'), independientes", () => {
  it("mercado con precio oficial propio (US) → source='market_price', monto y moneda del mercado, nunca el base COP", async () => {
    const market = await createPricingMarket({
      code: `AI-US-${Date.now()}`,
      name: "US test market",
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

    const context: PriceToolContext = { market, displayCurrency: "USD", locale: "es" };
    const result = await executeGetOfficialPrice(JSON.stringify({ itemSlug: "start" }), context);

    expect(result.source).toBe("market_price");
    expect(result.officialAmount).toBe(399);
    expect(result.officialCurrency).toBe("USD");
    expect(result.commercialMarket).toEqual({ code: market.code, name: market.name });
  });

  it("mercado 'OTHER' (Colombia/base) para el MISMO item → precio base COP, independiente del mercado US de arriba", async () => {
    const context = await otherMarketContext();
    const result = await executeGetOfficialPrice(JSON.stringify({ itemSlug: "start" }), context);

    expect(result.officialCurrency).toBe("COP");
    expect(result.officialAmount).not.toBe(399); // nunca el precio del mercado US
  });

  it("fallback QUOTE_ONLY sin precio propio → found:true pero officialAmount null, source='unavailable' — nunca inventa", async () => {
    const market = await createPricingMarket({
      code: `AI-QUOTE-${Date.now()}`,
      name: "Quote-only test market",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const context: PriceToolContext = { market, displayCurrency: "USD", locale: "es" };
    const result = await executeGetOfficialPrice(JSON.stringify({ itemSlug: "growth" }), context);

    expect(result.found).toBe(true);
    expect(result.officialAmount).toBeNull();
    expect(result.source).toBe("unavailable");
    expect(result.isOfficialCurrency).toBeNull();
  });
});

describe("get_official_price — Display Currency: officialAmount/officialCurrency SIEMPRE distintos de displayAmount/displayCurrency", () => {
  it("displayCurrency === officialCurrency → isOfficialCurrency:true, mismos montos", async () => {
    const market = await createPricingMarket({
      code: `AI-SAMECCY-${Date.now()}`,
      name: "Same currency test market",
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

    const context: PriceToolContext = { market, displayCurrency: "USD", locale: "es" };
    const result = await executeGetOfficialPrice(JSON.stringify({ itemSlug: "business" }), context);

    expect(result.isOfficialCurrency).toBe(true);
    expect(result.displayAmount).toBe(result.officialAmount);
    expect(result.displayCurrency).toBe(result.officialCurrency);
  });

  it("displayCurrency !== officialCurrency, tasa vigente → isOfficialCurrency:false, displayAmount es el equivalente, officialAmount SIN TOCAR", async () => {
    await recordExchangeRate({ quoteCurrency: "USD", rate: 0.00025, source: "ai-tools-test-fresh" });
    const market = await createPricingMarket({
      code: `AI-DIFFCCY-${Date.now()}`,
      name: "Different display currency test market",
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

    const context: PriceToolContext = { market, displayCurrency: "COP", locale: "es" };
    const result = await executeGetOfficialPrice(JSON.stringify({ itemSlug: "start" }), context);

    expect(result.officialAmount).toBe(399);
    expect(result.officialCurrency).toBe("USD");
    expect(result.isOfficialCurrency).toBe(false);
    expect(result.displayAmount).toBe(1_596_000); // 399 / 0.00025
    expect(result.displayCurrency).toBe("COP");
  });

  it("displayCurrency !== officialCurrency, SIN tasa vigente (vencida/inexistente) → cae al oficial, displayAmount===officialAmount, isOfficialCurrency:true", async () => {
    const market = await createPricingMarket({
      code: `AI-NORATE-${Date.now()}`,
      name: "No rate test market",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const item = await getPricingCatalogItemBySlug("professional");
    await createPricingMarketPrice({
      pricingCatalogId: item!.id,
      marketId: market.id,
      currency: "USD",
      priceType: "FIXED",
      price: 799,
      isActive: true,
    });

    // "GBP" no tiene tasa registrada en este entorno de pruebas.
    const context: PriceToolContext = { market, displayCurrency: "GBP", locale: "es" };
    const result = await executeGetOfficialPrice(JSON.stringify({ itemSlug: "professional" }), context);

    expect(result.officialAmount).toBe(799);
    expect(result.displayAmount).toBe(799); // fallback al oficial, nunca inventado
    expect(result.displayCurrency).toBe("USD");
    expect(result.isOfficialCurrency).toBe(true);
  });
});

describe("executeToolCall — dispatcher: nombre de tool desconocido y ejecución completa", () => {
  it("tool_call con un nombre desconocido → error limpio, nunca lanza", async () => {
    const context = await otherMarketContext();
    const toolCall: AIToolCall = { id: "call_1", type: "function", function: { name: "not_a_real_tool", arguments: "{}" } };
    const json = await executeToolCall(toolCall, context);
    expect(JSON.parse(json)).toEqual({ error: "unknown_tool", tool: "not_a_real_tool" });
  });

  it("get_official_price real → devuelve JSON serializado y parseable con el resultado completo", async () => {
    const context = await otherMarketContext();
    const toolCall: AIToolCall = {
      id: "call_2",
      type: "function",
      function: { name: GET_OFFICIAL_PRICE_TOOL.function.name, arguments: JSON.stringify({ itemSlug: "care-plus" }) },
    };
    const json = await executeToolCall(toolCall, context);
    const parsed = JSON.parse(json);
    expect(parsed.found).toBe(true);
    expect(parsed.name).toBe("Care+");
  });
});

describe("GET_OFFICIAL_PRICE_TOOL — el modelo NUNCA recibe market/displayCurrency como parámetro", () => {
  it("el JSON Schema de parameters solo declara itemSlug", () => {
    const properties = GET_OFFICIAL_PRICE_TOOL.function.parameters.properties as Record<string, unknown>;
    expect(Object.keys(properties)).toEqual(["itemSlug"]);
    expect(GET_OFFICIAL_PRICE_TOOL.function.parameters.additionalProperties).toBe(false);
  });
});
