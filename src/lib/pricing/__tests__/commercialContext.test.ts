import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mocks next/headers — no real Next.js request context exists in Vitest,
 * same pattern as src/lib/auth/__tests__/supabaseServer.test.ts. Both
 * `cookies()` and `headers()` are mocked independently so a test can
 * control exactly what's "sent" by the visitor.
 *
 * XAYVEN CORE Phase 3.1 — `geoip-lite` is also mocked. `resolveCommercialMarket()`
 * loads it via a dynamic `import("geoip-lite")` specifically so a real
 * missing/corrupt database degrades gracefully instead of crashing at
 * module load time (see the doc comment on `lookupCountryFromIp()`) — the
 * `geoipLookupMock` below lets tests simulate every one of those outcomes
 * (a real hit, no data for that IP, and a thrown error) without needing a
 * real IP-to-country database in the test environment.
 */
const cookieGetMock = vi.fn();
const headerGetMock = vi.fn();
const geoipLookupMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGetMock }),
  headers: async () => ({ get: headerGetMock }),
}));

vi.mock("geoip-lite", () => ({
  lookup: (ip: string) => geoipLookupMock(ip),
}));

import {
  resolveCommercialMarket,
  resolveDisplayCurrency,
  MARKET_COOKIE,
  DISPLAY_CURRENCY_COOKIE,
} from "@/lib/pricing/commercialContext";
import { createPricingMarket, setMarketCountry } from "@/lib/db/pricingMarketStore";
import { DEFAULT_FALLBACK_MARKET_CODE } from "@/lib/pricing/market/types";

describe("commercialContext — MARKET_COOKIE y DISPLAY_CURRENCY_COOKIE son cookies distintas", () => {
  it("los dos nombres de cookie nunca son el mismo string", () => {
    expect(MARKET_COOKIE).not.toBe(DISPLAY_CURRENCY_COOKIE);
  });
});

describe("resolveCommercialMarket", () => {
  beforeEach(() => {
    cookieGetMock.mockReset().mockReturnValue(undefined);
    headerGetMock.mockReset().mockReturnValue(null);
    geoipLookupMock.mockReset().mockReturnValue(null);
  });

  it("sin cookie, sin IP (ningún header de proxy) → mercado por defecto 'OTHER', source='default', geoip-lite NUNCA se llama", async () => {
    const { market, source } = await resolveCommercialMarket();
    expect(market.code).toBe(DEFAULT_FALLBACK_MARKET_CODE);
    expect(source).toBe("default");
    expect(geoipLookupMock).not.toHaveBeenCalled();
  });

  it("cookie explícita con un mercado real y activo → la respeta, source='explicit_cookie'", async () => {
    const m = await createPricingMarket({
      code: `CTX-COOKIE-${Date.now()}`,
      name: "Explicit cookie test",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    cookieGetMock.mockImplementation((name: string) => (name === MARKET_COOKIE ? { value: m.code } : undefined));

    const { market, source } = await resolveCommercialMarket();
    expect(market.id).toBe(m.id);
    expect(source).toBe("explicit_cookie");
  });

  it("cookie con un mercado inexistente/inactivo → se ignora, nunca lanza, cae al siguiente nivel", async () => {
    cookieGetMock.mockImplementation((name: string) => (name === MARKET_COOKIE ? { value: "NO-EXISTE-JAMAS" } : undefined));

    const { market, source } = await resolveCommercialMarket();
    expect(market.code).toBe(DEFAULT_FALLBACK_MARKET_CODE);
    expect(source).toBe("default");
  });

  it("US — IP real resuelve a market_countries('US') → lo usa, source='geo_suggestion'", async () => {
    const m = await createPricingMarket({
      code: `CTX-US-${Date.now()}`,
      name: "US test",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    await setMarketCountry("US", m.id);
    headerGetMock.mockImplementation((name: string) => (name === "x-real-ip" ? "203.0.113.10" : null));
    geoipLookupMock.mockImplementation((ip: string) => (ip === "203.0.113.10" ? { country: "US" } : null));

    const { market, source } = await resolveCommercialMarket();
    expect(market.id).toBe(m.id);
    expect(source).toBe("geo_suggestion");
  });

  it("CO — IP real resuelve a market_countries('CO') → lo usa, source='geo_suggestion'", async () => {
    const m = await createPricingMarket({
      code: `CTX-CO-${Date.now()}`,
      name: "CO test",
      currency: "COP",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    await setMarketCountry("CO", m.id);
    headerGetMock.mockImplementation((name: string) => (name === "x-real-ip" ? "203.0.113.11" : null));
    geoipLookupMock.mockImplementation((ip: string) => (ip === "203.0.113.11" ? { country: "CO" } : null));

    const { market, source } = await resolveCommercialMarket();
    expect(market.id).toBe(m.id);
    expect(source).toBe("geo_suggestion");
  });

  it("EU — IP real resuelve a un país europeo enrutado al mercado EU → lo usa, source='geo_suggestion'", async () => {
    const m = await createPricingMarket({
      code: `CTX-EU-${Date.now()}`,
      name: "EU test",
      currency: "EUR",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    await setMarketCountry("DE", m.id);
    headerGetMock.mockImplementation((name: string) => (name === "x-real-ip" ? "203.0.113.12" : null));
    geoipLookupMock.mockImplementation((ip: string) => (ip === "203.0.113.12" ? { country: "DE" } : null));

    const { market, source } = await resolveCommercialMarket();
    expect(market.id).toBe(m.id);
    expect(source).toBe("geo_suggestion");
  });

  it("unknown/unsupported — geoip-lite resuelve un país sin fila en market_countries → 'OTHER', source='default'", async () => {
    headerGetMock.mockImplementation((name: string) => (name === "x-real-ip" ? "203.0.113.13" : null));
    geoipLookupMock.mockImplementation((ip: string) => (ip === "203.0.113.13" ? { country: "ZZ" } : null));

    const { market, source } = await resolveCommercialMarket();
    expect(market.code).toBe(DEFAULT_FALLBACK_MARKET_CODE);
    expect(source).toBe("default");
  });

  it("edge — IP presente pero geoip-lite no tiene datos para ella (null) → 'OTHER', source='default', nunca lanza", async () => {
    headerGetMock.mockImplementation((name: string) => (name === "x-real-ip" ? "203.0.113.14" : null));
    geoipLookupMock.mockReturnValue(null);

    const { market, source } = await resolveCommercialMarket();
    expect(market.code).toBe(DEFAULT_FALLBACK_MARKET_CODE);
    expect(source).toBe("default");
  });

  it("edge — IP malformada (no pasa por ningún candidato público real) → 'OTHER', source='default', geoip-lite nunca se llama", async () => {
    // Sin x-real-ip ni x-forwarded-for válidos, getClientIpFromHeaders()
    // devuelve 'unknown' — lookupCountryFromIp() corta ahí, antes de
    // siquiera intentar cargar geoip-lite.
    headerGetMock.mockReturnValue(null);

    const { market, source } = await resolveCommercialMarket();
    expect(market.code).toBe(DEFAULT_FALLBACK_MARKET_CODE);
    expect(source).toBe("default");
    expect(geoipLookupMock).not.toHaveBeenCalled();
  });

  it("edge — geoip-lite lanza (simula base de datos faltante/corrupta) → nunca se propaga, cae a 'OTHER', source='default'", async () => {
    headerGetMock.mockImplementation((name: string) => (name === "x-real-ip" ? "203.0.113.15" : null));
    geoipLookupMock.mockImplementation(() => {
      throw new Error("simulated missing geoip-lite database");
    });

    const { market, source } = await resolveCommercialMarket();
    expect(market.code).toBe(DEFAULT_FALLBACK_MARKET_CODE);
    expect(source).toBe("default");
  });

  it("precedencia — cookie manual CO + IP real detectando US → la cookie SIEMPRE gana, source='explicit_cookie' (nunca sobrescrita por una detección)", async () => {
    const cookieMarket = await createPricingMarket({
      code: `CTX-PRIO-COOKIE-${Date.now()}`,
      name: "Priority cookie",
      currency: "COP",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const geoMarket = await createPricingMarket({
      code: `CTX-PRIO-GEO-${Date.now()}`,
      name: "Priority geo",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    await setMarketCountry("PG", geoMarket.id);
    cookieGetMock.mockImplementation((name: string) => (name === MARKET_COOKIE ? { value: cookieMarket.code } : undefined));
    headerGetMock.mockImplementation((name: string) => (name === "x-real-ip" ? "203.0.113.16" : null));
    geoipLookupMock.mockImplementation((ip: string) => (ip === "203.0.113.16" ? { country: "PG" } : null));

    const { market, source } = await resolveCommercialMarket();
    expect(market.id).toBe(cookieMarket.id);
    expect(source).toBe("explicit_cookie");
    // La cookie gana antes de siquiera intentar geolocalizar — geoip-lite
    // nunca se llama cuando ya hay una selección manual válida.
    expect(geoipLookupMock).not.toHaveBeenCalled();
  });

  it("precedencia — sin cookie, con IP real detectando US → gana la detección, source='geo_suggestion'", async () => {
    const m = await createPricingMarket({
      code: `CTX-NO-COOKIE-${Date.now()}`,
      name: "No cookie, real detection",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    await setMarketCountry("ND", m.id);
    headerGetMock.mockImplementation((name: string) => (name === "x-real-ip" ? "203.0.113.17" : null));
    geoipLookupMock.mockImplementation((ip: string) => (ip === "203.0.113.17" ? { country: "ND" } : null));

    const { market, source } = await resolveCommercialMarket();
    expect(market.id).toBe(m.id);
    expect(source).toBe("geo_suggestion");
  });

  it("precedencia — sin cookie, detección fallida (geoip-lite sin datos) → 'OTHER', source='default'", async () => {
    headerGetMock.mockImplementation((name: string) => (name === "x-real-ip" ? "203.0.113.18" : null));
    geoipLookupMock.mockReturnValue(null);

    const { market, source } = await resolveCommercialMarket();
    expect(market.code).toBe(DEFAULT_FALLBACK_MARKET_CODE);
    expect(source).toBe("default");
  });
});

describe("toMarketDetectionState", () => {
  it("mapea explicit_cookie/geo_suggestion/default a manual/detected/fallback — el vocabulario que llega a la UI", async () => {
    const { toMarketDetectionState } = await import("@/lib/pricing/commercialContext");
    expect(toMarketDetectionState("explicit_cookie")).toBe("manual");
    expect(toMarketDetectionState("geo_suggestion")).toBe("detected");
    expect(toMarketDetectionState("default")).toBe("fallback");
  });
});

describe("resolveDisplayCurrency — independiente de resolveCommercialMarket", () => {
  beforeEach(() => {
    cookieGetMock.mockReset().mockReturnValue(undefined);
  });

  it("sin cookie de display → usa la moneda del market ya resuelto (pasado como parámetro, nunca re-resuelto)", async () => {
    const market = await createPricingMarket({
      code: `DISP-DEFAULT-${Date.now()}`,
      name: "Display default test",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const { currency, source } = await resolveDisplayCurrency(market);
    expect(currency).toBe("USD");
    expect(source).toBe("market_default");
  });

  it("con cookie de display distinta a la moneda del market → la respeta, source='explicit_cookie', y el market pasado como parámetro no se toca", async () => {
    const market = await createPricingMarket({
      code: `DISP-EXPLICIT-${Date.now()}`,
      name: "Display explicit test",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    cookieGetMock.mockImplementation((name: string) => (name === DISPLAY_CURRENCY_COOKIE ? { value: "COP" } : undefined));

    const { currency, source } = await resolveDisplayCurrency(market);
    expect(currency).toBe("COP");
    expect(source).toBe("explicit_cookie");
    // El market en sí — la fuente del precio oficial — nunca cambia: sigue
    // siendo USD, solo la presentación pidió COP.
    expect(market.currency).toBe("USD");
  });

  it("resolveDisplayCurrency() nunca lee MARKET_COOKIE — cambiar la cookie de mercado no afecta esta función en absoluto", async () => {
    const market = await createPricingMarket({
      code: `DISP-ISOLATION-${Date.now()}`,
      name: "Isolation test",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    // Solo se configura MARKET_COOKIE, nunca DISPLAY_CURRENCY_COOKIE.
    cookieGetMock.mockImplementation((name: string) => (name === MARKET_COOKIE ? { value: "algun-otro-mercado" } : undefined));

    const { currency, source } = await resolveDisplayCurrency(market);
    // Sin DISPLAY_CURRENCY_COOKIE, cae al default del market pasado — la
    // cookie de mercado (que sí está presente) es simplemente irrelevante
    // para esta función.
    expect(currency).toBe("USD");
    expect(source).toBe("market_default");
  });
});
