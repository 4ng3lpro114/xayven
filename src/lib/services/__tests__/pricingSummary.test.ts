import { describe, it, expect } from "vitest";
import { applyDisplayCurrency } from "@/lib/services/pricingSummary";
import { recordExchangeRate } from "@/lib/db/exchangeRateStore";
import type { ServicePriceSummary } from "@/lib/services/pricingSummary";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY en el entorno de pruebas — todos
// los stores tocados aquí usan su fallback en memoria.

describe("applyDisplayCurrency — Display Currency (Phase D): presentación, NUNCA re-resuelve cuál es el precio oficial", () => {
  it("kind='quote' → se devuelve sin cambios, nada que convertir", async () => {
    const summary: ServicePriceSummary = { kind: "quote" };
    const result = await applyDisplayCurrency(summary, "COP");
    expect(result).toEqual(summary);
    expect(result).toBe(summary); // ni siquiera se crea un objeto nuevo
  });

  it("displayCurrency === moneda oficial → se devuelve el mismo summary, sin conversión", async () => {
    const summary: ServicePriceSummary = { kind: "fixed", amount: 399, currency: "USD" };
    const result = await applyDisplayCurrency(summary, "USD");
    expect(result).toEqual(summary);
  });

  it("USD oficial + displayCurrency COP con tasa fresca → monto convertido, 'kind' preservado", async () => {
    await recordExchangeRate({ quoteCurrency: "USD", rate: 0.00025, source: "pricing-summary-display-test" });
    const summary: ServicePriceSummary = { kind: "from", amount: 399, currency: "USD" };
    const result = await applyDisplayCurrency(summary, "COP");
    expect(result.kind).toBe("from"); // "from"/"fixed" es un hecho del precio oficial, la moneda no lo cambia
    expect(result.currency).toBe("COP");
    expect(result.amount).toBe(1_596_000); // 399 / 0.00025, redondeado a la unidad COP (1000)
  });

  it("sin tasa disponible → cae al summary oficial sin cambios, nunca un equivalente inventado", async () => {
    const summary: ServicePriceSummary = { kind: "fixed", amount: 79, currency: "USD" };
    const result = await applyDisplayCurrency(summary, "GBP"); // GBP sin currency_config/exchange_rates sembrados aquí
    expect(result).toEqual(summary);
  });

  it("dos summaries en la MISMA moneda oficial pero de mercados distintos siguen siendo independientes tras aplicar el mismo displayCurrency", async () => {
    const summaryMarketA: ServicePriceSummary = { kind: "fixed", amount: 999, currency: "USD" };
    const summaryMarketB: ServicePriceSummary = { kind: "fixed", amount: 1099, currency: "USD" };
    const [resultA, resultB] = await Promise.all([
      applyDisplayCurrency(summaryMarketA, "COP"),
      applyDisplayCurrency(summaryMarketB, "COP"),
    ]);
    expect(resultA.amount).not.toBe(resultB.amount);
    expect(resultA.currency).toBe("COP");
    expect(resultB.currency).toBe("COP");
  });
});
