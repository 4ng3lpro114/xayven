import { describe, it, expect } from "vitest";
import { recordExchangeRate, getLatestExchangeRate, listExchangeRates } from "@/lib/db/exchangeRateStore";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// exchangeRateStore.ts transparently uses its in-memory fallback.

describe("exchangeRateStore", () => {
  it("moneda sin ninguna tasa registrada → null, nunca lanza", async () => {
    expect(await getLatestExchangeRate("ZZZ-NO-RATE")).toBeNull();
  });

  it("recordExchangeRate() siempre usa baseCurrency='COP', nunca aceptado como input", async () => {
    const rate = await recordExchangeRate({ quoteCurrency: "USD", rate: 0.00025, source: "manual-test" });
    expect(rate.baseCurrency).toBe("COP");
    expect(rate.quoteCurrency).toBe("USD");
  });

  it("getLatestExchangeRate() devuelve la observación más reciente, no la primera", async () => {
    const pair = `PAIR-${Date.now()}`;
    await recordExchangeRate({ quoteCurrency: "USD", rate: 0.0002, source: `${pair}-old` });
    await new Promise((r) => setTimeout(r, 5));
    const newer = await recordExchangeRate({ quoteCurrency: "USD", rate: 0.00025, source: `${pair}-new` });
    const latest = await getLatestExchangeRate("USD");
    expect(latest?.id).toBe(newer.id);
    expect(latest?.source).toBe(`${pair}-new`);
  });

  it("es append-only — no existe función de update/delete exportada", async () => {
    const storeModule = await import("@/lib/db/exchangeRateStore");
    expect((storeModule as Record<string, unknown>).updateExchangeRate).toBeUndefined();
    expect((storeModule as Record<string, unknown>).deleteExchangeRate).toBeUndefined();
  });

  it("listExchangeRates() devuelve el historial completo, más reciente primero", async () => {
    const quote = `HIST-${Date.now()}`;
    // quoteCurrency debe ser del set cerrado a nivel de schema (COP/USD),
    // pero el store en sí no valida — usamos USD y un source único para
    // aislar este caso del resto del historial acumulado de USD.
    await recordExchangeRate({ quoteCurrency: "USD", rate: 0.0001, source: quote });
    const history = await listExchangeRates("USD");
    expect(history.some((r) => r.source === quote)).toBe(true);
    // Orden descendente por fetchedAt.
    for (let i = 1; i < history.length; i++) {
      expect(history[i - 1]!.fetchedAt >= history[i]!.fetchedAt).toBe(true);
    }
  });
});
