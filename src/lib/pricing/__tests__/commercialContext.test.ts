import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mocks next/headers — no real Next.js request context exists in Vitest,
 * same pattern as src/lib/auth/__tests__/supabaseServer.test.ts. Both
 * `cookies()` and `headers()` are mocked independently so a test can
 * control exactly what's "sent" by the visitor.
 */
const cookieGetMock = vi.fn();
const headerGetMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGetMock }),
  headers: async () => ({ get: headerGetMock }),
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
  });

  it("sin cookie ni geo header → mercado por defecto 'OTHER', source='default'", async () => {
    const { market, source } = await resolveCommercialMarket();
    expect(market.code).toBe(DEFAULT_FALLBACK_MARKET_CODE);
    expect(source).toBe("default");
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

  it("sin cookie, con geo header enrutado a un mercado real → lo usa, source='geo_suggestion'", async () => {
    const m = await createPricingMarket({
      code: `CTX-GEO-${Date.now()}`,
      name: "Geo suggestion test",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    await setMarketCountry("XU", m.id);
    headerGetMock.mockImplementation((name: string) => (name === "x-vercel-ip-country" ? "XU" : null));

    const { market, source } = await resolveCommercialMarket();
    expect(market.id).toBe(m.id);
    expect(source).toBe("geo_suggestion");
  });

  it("geo header presente pero el país no está enrutado a ningún mercado → 'OTHER', source='default'", async () => {
    headerGetMock.mockImplementation((name: string) => (name === "x-vercel-ip-country" ? "ZZ" : null));

    const { market, source } = await resolveCommercialMarket();
    expect(market.code).toBe(DEFAULT_FALLBACK_MARKET_CODE);
    expect(source).toBe("default");
  });

  it("la cookie explícita SIEMPRE gana sobre el geo header, aunque ambos estén presentes — la selección explícita nunca es sobrescrita por una sugerencia", async () => {
    const cookieMarket = await createPricingMarket({
      code: `CTX-PRIO-COOKIE-${Date.now()}`,
      name: "Priority cookie",
      currency: "USD",
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
    headerGetMock.mockImplementation((name: string) => (name === "x-vercel-ip-country" ? "PG" : null));

    const { market, source } = await resolveCommercialMarket();
    expect(market.id).toBe(cookieMarket.id);
    expect(source).toBe("explicit_cookie");
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
