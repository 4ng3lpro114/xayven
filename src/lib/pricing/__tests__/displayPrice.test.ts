import { describe, it, expect } from "vitest";
import { toDisplayPrice, withDisplayPrice } from "@/lib/pricing/displayPrice";
import { recordExchangeRate } from "@/lib/db/exchangeRateStore";
import type { OfficialPriceResult } from "@/lib/pricing/market/types";
import type { RecordExchangeRateInput, CurrencyConfigInput } from "@/lib/pricing/currency/validation";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment — all
// stores touched here use their in-memory fallback.

function official(overrides: Partial<OfficialPriceResult> = {}): OfficialPriceResult {
  return {
    itemSlug: "start",
    marketCode: "US",
    currency: "USD",
    amount: 399,
    priceType: "FIXED",
    billingInterval: "ONE_TIME",
    source: "market_price",
    effectiveAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("toDisplayPrice — presentación, NUNCA cambia cuál es el precio oficial", () => {
  it("amount null (source='unavailable') → null, nada que mostrar", async () => {
    const result = await toDisplayPrice(official({ amount: null, source: "unavailable" }), "COP");
    expect(result).toBeNull();
  });

  it("displayCurrency === moneda oficial → devuelve el mismo monto, isOfficial=true, sin conversión", async () => {
    const result = await toDisplayPrice(official({ currency: "USD", amount: 399 }), "USD");
    expect(result).toEqual({ amount: 399, currency: "USD", isOfficial: true });
  });

  it("displayCurrency distinta, sin tasa disponible → null, nunca un equivalente inventado", async () => {
    const result = await toDisplayPrice(official({ currency: "USD", amount: 399 }), "COP");
    expect(result).toBeNull();
  });

  it("USD oficial → COP de visualización, con tasa fresca → equivalente calculado, isOfficial=false, precio oficial en USD sin tocar", async () => {
    // rate = cuántos USD por 1 COP. Para ir de USD→COP dividimos por rate.
    await recordExchangeRate({ quoteCurrency: "USD", rate: 0.00025, source: "display-test-usd-cop" });
    const off = official({ currency: "USD", amount: 399 });
    const result = await toDisplayPrice(off, "COP");
    expect(result).not.toBeNull();
    expect(result!.currency).toBe("COP");
    expect(result!.isOfficial).toBe(false);
    // 399 USD / 0.00025 = 1_596_000 COP, redondeado a la unidad COP (1000).
    expect(result!.amount).toBe(1_596_000);
    // El objeto oficial original nunca se muta.
    expect(off.currency).toBe("USD");
    expect(off.amount).toBe(399);
  });

  it("COP oficial → USD de visualización, con la misma tasa → equivalente inverso coherente", async () => {
    const off = official({ currency: "COP", amount: 1_596_000 });
    const result = await toDisplayPrice(off, "USD");
    expect(result).not.toBeNull();
    expect(result!.currency).toBe("USD");
    expect(result!.amount).toBe(399); // 1_596_000 * 0.00025 = 399
  });

  it("US market official price ($399 USD) mostrado en COP NUNCA coincide con un precio colombiano distinto sembrado aparte — es un equivalente, no una sustitución", async () => {
    const usOfficial = official({ marketCode: "US", currency: "USD", amount: 399 });
    const displayed = await toDisplayPrice(usOfficial, "COP");
    // El equivalente de $399 USD en COP (con la tasa de esta prueba,
    // 1_596_000) es un número completamente distinto del precio base
    // colombiano real de Pricing Core (START = 799_000 COP) — prueba
    // explícita de que esta función nunca "encuentra" el precio de otro
    // mercado, solo convierte el que ya tenía.
    expect(displayed!.amount).not.toBe(799_000);
    expect(usOfficial.marketCode).toBe("US"); // el commercialMarket nunca cambia
  });

  it("cruce entre dos monedas no-COP (vía pivote COP) → funciona cuando ambas tasas existen y están vigentes", async () => {
    // EUR está en el set cerrado a nivel de schema (International Pricing
    // — Canonical Anchor, aprobado 2026-08-18) — este test ejercita el
    // camino de pivote genérico (displayCurrency !== 'COP' && official.
    // currency !== 'COP') directamente con un official USD, sin tocar
    // ningún mercado real ni MARKET_SIBLING_GROUPS (marketSync.ts), que es
    // el único camino que hoy sincroniza EUR↔USD sin pivotar.
    const eurInput: RecordExchangeRateInput = { quoteCurrency: "EUR", rate: 0.00023, source: "display-test-pivot-eur" };
    await recordExchangeRate(eurInput);
    const { setCurrencyConfig } = await import("@/lib/db/currencyConfigStore");
    const eurConfig: CurrencyConfigInput = { currency: "EUR", roundingUnit: 1, decimalPlaces: 2 };
    await setCurrencyConfig(eurConfig);

    const off = official({ currency: "USD", amount: 399 });
    const result = await toDisplayPrice(off, "EUR");
    expect(result).not.toBeNull();
    expect(result!.currency).toBe("EUR");
    expect(result!.isOfficial).toBe(false);
  });
});

describe("withDisplayPrice — envuelve un OfficialPriceResult completo, preservando itemSlug/marketCode/priceType/source/effectiveAt intactos", () => {
  it("amount===null (unavailable) → el mismo objeto, sin cambios", async () => {
    const off = official({ amount: null, source: "unavailable" });
    const result = await withDisplayPrice(off, "COP");
    expect(result).toBe(off);
  });

  it("displayCurrency === moneda oficial → mismos valores, sin conversión (isOfficial=true internamente)", async () => {
    const off = official({ currency: "USD", amount: 399 });
    const result = await withDisplayPrice(off, "USD");
    expect(result).toEqual(off);
  });

  it("conversión exitosa → amount/currency reemplazados por el equivalente, TODO lo demás (itemSlug, marketCode, priceType, source, effectiveAt) preservado sin tocar", async () => {
    await recordExchangeRate({ quoteCurrency: "USD", rate: 0.00025, source: "with-display-price-test" });
    const off = official({ itemSlug: "start", marketCode: "US", currency: "USD", amount: 399, priceType: "FIXED", source: "market_price" });
    const result = await withDisplayPrice(off, "COP");

    expect(result.amount).toBe(1_596_000);
    expect(result.currency).toBe("COP");
    // El "market" que produjo este precio nunca cambia — solo cambió cómo se presenta.
    expect(result.marketCode).toBe("US");
    expect(result.itemSlug).toBe("start");
    expect(result.priceType).toBe("FIXED");
    expect(result.source).toBe("market_price");
    expect(result.effectiveAt).toBe(off.effectiveAt);
    // El objeto original nunca se muta.
    expect(off.amount).toBe(399);
    expect(off.currency).toBe("USD");
  });

  it("sin tasa disponible → devuelve el OfficialPriceResult original sin cambios, nunca inventa un monto", async () => {
    const off = official({ currency: "USD", amount: 79 });
    const result = await withDisplayPrice(off, "GBP");
    expect(result).toBe(off);
  });
});
