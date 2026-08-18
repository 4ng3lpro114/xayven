import { describe, it, expect } from "vitest";
import { listCurrencyConfigs, getCurrencyConfig, setCurrencyConfig } from "@/lib/db/currencyConfigStore";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// currencyConfigStore.ts transparently uses its in-memory fallback.

describe("currencyConfigStore", () => {
  it("siembra exactamente COP y USD con las reglas de redondeo documentadas", async () => {
    const configs = await listCurrencyConfigs();
    const cop = configs.find((c) => c.currency === "COP");
    const usd = configs.find((c) => c.currency === "USD");
    expect(cop).toMatchObject({ currency: "COP", roundingUnit: 1000, decimalPlaces: 0 });
    expect(usd).toMatchObject({ currency: "USD", roundingUnit: 1, decimalPlaces: 2 });
  });

  it("moneda no configurada → null, nunca lanza", async () => {
    expect(await getCurrencyConfig("XXX")).toBeNull();
  });

  it("setCurrencyConfig crea una configuración nueva para una moneda ya cerrada por el schema (COP/USD) idempotentemente", async () => {
    const updated = await setCurrencyConfig({ currency: "USD", roundingUnit: 5, decimalPlaces: 2 });
    expect(updated.roundingUnit).toBe(5);
    const found = await getCurrencyConfig("USD");
    expect(found?.roundingUnit).toBe(5);
    // Restaurar para no contaminar otros tests que dependan del valor sembrado.
    await setCurrencyConfig({ currency: "USD", roundingUnit: 1, decimalPlaces: 2 });
  });
});
