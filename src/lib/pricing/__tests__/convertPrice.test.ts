import { describe, it, expect } from "vitest";
import { convertFromBase, roundCommercial, MAX_EXCHANGE_RATE_AGE_MS } from "@/lib/pricing/convertPrice";
import { recordExchangeRate } from "@/lib/db/exchangeRateStore";
import { getGlobalArray } from "@/lib/db/memoryStore";
import type { ExchangeRate } from "@/lib/pricing/currency/types";
import type { RecordExchangeRateInput } from "@/lib/pricing/currency/validation";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment — both
// exchangeRateStore and currencyConfigStore use their in-memory fallback.
// Tests in this file run sequentially against the SAME in-memory store, so
// ordering matters: the "no rate recorded yet" case runs before any USD
// rate is written anywhere else in this file.

describe("roundCommercial — regla de redondeo comercial compartida", () => {
  it("redondea al múltiplo más cercano del roundingUnit dado", () => {
    expect(roundCommercial(199.75, 1)).toBe(200);
    expect(roundCommercial(1_234_567, 1000)).toBe(1_235_000);
    expect(roundCommercial(1_234_499, 1000)).toBe(1_234_000);
  });
});

describe("convertFromBase — Phase C, nunca inventa, nunca estima", () => {
  it("quoteCurrency === 'COP' → null (nada que convertir)", async () => {
    expect(await convertFromBase(799_000, "COP")).toBeNull();
  });

  it("ninguna tasa registrada todavía para USD → null, nunca lanza", async () => {
    expect(await convertFromBase(799_000, "USD")).toBeNull();
  });

  it("con una tasa fresca registrada → convierte y redondea correctamente, effectiveAt = fetchedAt de esa tasa", async () => {
    const rate = await recordExchangeRate({ quoteCurrency: "USD", rate: 0.00025, source: "convert-test-fresh" });
    const result = await convertFromBase(799_000, "USD");
    expect(result).not.toBeNull();
    expect(result!.amount).toBe(200); // 799000 * 0.00025 = 199.75 → roundingUnit USD=1 → 200
    expect(result!.effectiveAt).toBe(rate.fetchedAt);
  });

  it("usa SIEMPRE la observación más reciente, no la primera registrada", async () => {
    const newer = await recordExchangeRate({ quoteCurrency: "USD", rate: 0.0005, source: "convert-test-newer" });
    // `fetchedAt` tiene resolución de milisegundo — dos recordExchangeRate()
    // consecutivos dentro del mismo test pueden aterrizar en el mismo ms,
    // dejando el desempate de getLatestExchangeRate() (r.fetchedAt >
    // latest.fetchedAt, estrictamente mayor) en manos del reloj real, no
    // determinista. Se adelanta explícitamente el fetchedAt de ESTA fila
    // (misma técnica de manipulación directa que la prueba de "tasa
    // vencida" más abajo en este archivo) para que "más reciente" nunca
    // dependa de qué tan rápido corrió la máquina.
    const store = getGlobalArray<ExchangeRate>("pricing.exchangeRates");
    const row = store.find((r) => r.id === newer.id);
    if (row) row.fetchedAt = new Date(Date.now() + 1000).toISOString();

    const result = await convertFromBase(1_000_000, "USD");
    expect(result!.amount).toBe(500); // 1_000_000 * 0.0005 = 500
  });

  it("tasa más vieja que MAX_EXCHANGE_RATE_AGE_MS → null, nunca usa una tasa vencida silenciosamente", async () => {
    await recordExchangeRate({ quoteCurrency: "USD", rate: 0.0009, source: "convert-test-stale" });
    // Retrocede artificialmente el fetchedAt de TODAS las filas USD
    // registradas hasta ahora en este archivo (las pruebas anteriores ya
    // dejaron observaciones frescas) — simula que la ventana de vigencia
    // completa quedó atrás, sin depender de sleeps reales de 48h y sin
    // que el orden de ejecución de otras pruebas afecte el resultado.
    const store = getGlobalArray<ExchangeRate>("pricing.exchangeRates");
    const old = new Date(Date.now() - MAX_EXCHANGE_RATE_AGE_MS - 60_000).toISOString();
    for (const row of store) {
      if (row.quoteCurrency === "USD") row.fetchedAt = old;
    }

    const result = await convertFromBase(1_000_000, "USD");
    expect(result).toBeNull();
  });

  it("hay tasa pero no existe CurrencyConfig para esa moneda → null, nunca inventa una regla de redondeo", async () => {
    // 'EUR' no forma parte del set cerrado COP/USD a nivel de schema — se
    // fuerza aquí solo para ejercitar esta rama defensiva del store
    // (el store en sí no valida el enum, solo el schema de Zod que las
    // rutas de escritura usarán en una fase futura).
    const input = { quoteCurrency: "EUR", rate: 0.00023, source: "convert-test-no-config" } as unknown as RecordExchangeRateInput;
    await recordExchangeRate(input);
    const result = await convertFromBase(799_000, "EUR");
    expect(result).toBeNull();
  });
});
