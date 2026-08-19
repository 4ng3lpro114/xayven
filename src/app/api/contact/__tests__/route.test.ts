import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * XAYVEN CORE Phase 1 — resolveCommercialMarket()/resolveDisplayCurrency()
 * call `cookies()` (next/headers), which throws "called outside a request
 * scope" when POST() is invoked directly like this test file already does
 * — same reason /api/ai/chat/route.test.ts mocks
 * @/lib/pricing/commercialContext instead of letting the real cookies()
 * call run. Defaults to the exact same OTHER/COP fallback production code
 * itself falls back to when nothing else resolves (not a fake state).
 */
const DEFAULT_TEST_MARKET = {
  id: "hardcoded-fallback-market",
  createdAt: "1970-01-01T00:00:00.000Z",
  updatedAt: "1970-01-01T00:00:00.000Z",
  code: "OTHER",
  name: "Other markets (unassigned)",
  currency: "COP",
  conversionAllowed: false,
  fallbackBehavior: "BASE_REFERENCE" as const,
  isActive: true,
};
const resolveCommercialMarketMock = vi.fn().mockResolvedValue({ market: DEFAULT_TEST_MARKET, source: "default" });
const resolveDisplayCurrencyMock = vi.fn().mockResolvedValue({ currency: "COP", source: "market_default" });
vi.mock("@/lib/pricing/commercialContext", () => ({
  resolveCommercialMarket: () => resolveCommercialMarketMock(),
  resolveDisplayCurrency: () => resolveDisplayCurrencyMock(),
}));

import { listContactRequests } from "@/lib/db/contactRequestStore";
import { createPricingMarket, createPricingMarketPrice } from "@/lib/db/pricingMarketStore";
import { getPricingCatalogItemBySlug } from "@/lib/db/pricingCatalogStore";
import { POST } from "../route";

const ORIGINAL_ENV = { ...process.env };

function makeRequest(body: Record<string, unknown>, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Diana",
    email: `diana-${Date.now()}-${Math.random()}@example.com`,
    company: "Aguacates",
    projectType: "Sitio web nuevo",
    budget: "Menos de $1.000.000 COP",
    message: "Necesito un sitio web nuevo para mi negocio de aguacates.",
    website: "", // honeypot, empty = real user
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("POST /api/contact", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.CONTACT_EMAIL_TO;
    resolveCommercialMarketMock.mockReset().mockResolvedValue({ market: DEFAULT_TEST_MARKET, source: "default" });
    resolveDisplayCurrencyMock.mockReset().mockResolvedValue({ currency: "COP", source: "market_default" });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("D. validación inválida (mensaje demasiado corto) → 400, nada se persiste", async () => {
    const res = await POST(makeRequest(makePayload({ message: "corto" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("validation_failed");
  });

  it("honeypot relleno → 200 sin persistir (comportamiento anti-spam sin cambios)", async () => {
    const payload = makePayload({ website: "http://bot.example" });
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(200);
    const all = await listContactRequests();
    expect(all.some((r) => r.email === payload.email)).toBe(false);
  });

  it("A. envío válido, RESEND_API_KEY+CONTACT_EMAIL_TO no configurados → persisted:true, emailSent:false, y la solicitud queda guardada", async () => {
    const payload = makePayload();
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, persisted: true, emailSent: false });

    const all = await listContactRequests();
    const saved = all.find((r) => r.email === payload.email);
    expect(saved).toBeDefined();
    expect(saved?.status).toBe("new");
    expect(saved?.name).toBe(payload.name);
    expect(saved?.message).toBe(payload.message);
  });

  it("A2. envío válido, Resend responde éxito → persisted:true, emailSent:true", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.CONTACT_EMAIL_TO = "admin@example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ id: "email-id-123" }))
    );

    const payload = makePayload();
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, persisted: true, emailSent: true });

    const all = await listContactRequests();
    expect(all.some((r) => r.email === payload.email)).toBe(true);
  });

  it("B. envío válido, Resend responde error → la solicitud sigue guardada, emailSent:false", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.CONTACT_EMAIL_TO = "admin@example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "invalid domain" }, 422))
    );

    const payload = makePayload();
    const res = await POST(makeRequest(payload));
    // Never reported as a request-level failure — the request was already
    // persisted before Resend was ever called.
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, persisted: true, emailSent: false });

    const all = await listContactRequests();
    const saved = all.find((r) => r.email === payload.email);
    expect(saved).toBeDefined();
    expect(saved?.status).toBe("new");
  });

  it("B2. Resend lanza una excepción de red → la solicitud sigue guardada, emailSent:false", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.CONTACT_EMAIL_TO = "admin@example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    const payload = makePayload();
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, persisted: true, emailSent: false });

    const all = await listContactRequests();
    expect(all.some((r) => r.email === payload.email)).toBe(true);
  });

  it("E. excede el rate limit → 429, sin importar cuántas veces se reintente después", async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 254) + 1}`; // fresh bucket per test run
    let lastRes: Response | undefined;
    for (let i = 0; i < 11; i++) {
      lastRes = await POST(makeRequest(makePayload(), { "x-forwarded-for": ip }));
    }
    expect(lastRes?.status).toBe(429);
    expect((await lastRes!.json()).error).toBe("rate_limited");
  });
});

describe("POST /api/contact — C. la persistencia falla (mockeado)", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/db/contactRequestStore");
    vi.resetModules();
  });

  it("createContactRequest lanza → 500 persist_failed, nunca se afirma éxito, nunca se llama a Resend", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/contactRequestStore", () => ({
      createContactRequest: vi.fn(async () => {
        throw new Error("connection failure");
      }),
    }));

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    process.env.RESEND_API_KEY = "test-key";
    process.env.CONTACT_EMAIL_TO = "admin@example.com";

    const { POST: PostWithMockedStore } = await import("../route");
    const res = await PostWithMockedStore(makeRequest(makePayload()));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("persist_failed");
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.CONTACT_EMAIL_TO;
  });
});

// ---------------------------------------------------------------------------
// XAYVEN CORE Phase 1 — Capture Commercial Context
// ---------------------------------------------------------------------------

describe("POST /api/contact — XAYVEN CORE Phase 1: contexto comercial", () => {
  let ipCounter = 1;
  /** Cada test usa su propio bucket de rate limit — mismo motivo que la
   *  prueba "E." ya establecida: el límite es 10/10min por IP, y este
   *  archivo hace muchas más de 10 llamadas a POST() en total. */
  function uniqueHeaders() {
    return { "x-forwarded-for": `198.51.100.${ipCounter++}` };
  }

  let coMarket: Awaited<ReturnType<typeof createPricingMarket>>;

  beforeAll(async () => {
    // Mercado CO real (no solo el objeto que mockResolvedValue devuelve) —
    // resolveOfficialPrice() vuelve a consultar pricing_markets por código
    // internamente, independiente de lo que resolveCommercialMarket()
    // (mockeado) diga que devolvió.
    coMarket = await createPricingMarket({
      code: "CO",
      name: "Colombia",
      currency: "COP",
      conversionAllowed: false,
      fallbackBehavior: "BASE_REFERENCE",
      isActive: true,
    });
  });

  beforeEach(() => {
    resolveCommercialMarketMock.mockReset().mockResolvedValue({ market: DEFAULT_TEST_MARKET, source: "default" });
    resolveDisplayCurrencyMock.mockReset().mockResolvedValue({ currency: "COP", source: "market_default" });
  });

  async function findSaved(email: string) {
    const all = await listContactRequests();
    return all.find((r) => r.email === email);
  }

  it("1. CO + COP, sin plan → marketCode/displayCurrency capturados, officialAmount/officialCurrency null (nada que mostrar sin plan)", async () => {
    resolveCommercialMarketMock.mockResolvedValue({ market: coMarket, source: "explicit_cookie" });
    resolveDisplayCurrencyMock.mockResolvedValue({ currency: "COP", source: "market_default" });

    const payload = makePayload();
    const res = await POST(makeRequest(payload, uniqueHeaders()));
    expect(res.status).toBe(200);

    const saved = await findSaved(payload.email);
    expect(saved?.marketCode).toBe("CO");
    expect(saved?.displayCurrency).toBe("COP");
    expect(saved?.officialAmount).toBeNull();
    expect(saved?.officialCurrency).toBeNull();
  });

  it("6. CO + E-COMMERCE + COP (plan=ecommerce, mercado con BASE_REFERENCE) → 3.499.000 COP exacto", async () => {
    resolveCommercialMarketMock.mockResolvedValue({ market: coMarket, source: "explicit_cookie" });
    resolveDisplayCurrencyMock.mockResolvedValue({ currency: "COP", source: "market_default" });

    const payload = makePayload({ plan: "ecommerce" });
    const res = await POST(makeRequest(payload, uniqueHeaders()));
    expect(res.status).toBe(200);

    const saved = await findSaved(payload.email);
    expect(saved?.marketCode).toBe("CO");
    expect(saved?.officialAmount).toBe(3_499_000);
    expect(saved?.officialCurrency).toBe("COP");
    expect(saved?.pricingCatalogId).not.toBeNull();
  });

  describe("EU/US — precios explícitos reales, sibling-swap sin exchange_rates", () => {
    let euMarket: Awaited<ReturnType<typeof createPricingMarket>>;
    let usMarket: Awaited<ReturnType<typeof createPricingMarket>>;

    beforeAll(async () => {
      euMarket = await createPricingMarket({
        code: "EU",
        name: "Europe",
        currency: "EUR",
        conversionAllowed: false,
        fallbackBehavior: "QUOTE_ONLY",
        isActive: true,
      });
      usMarket = await createPricingMarket({
        code: "US",
        name: "United States",
        currency: "USD",
        conversionAllowed: false,
        fallbackBehavior: "QUOTE_ONLY",
        isActive: true,
      });

      const ecommerce = await getPricingCatalogItemBySlug("ecommerce");
      const custom = await getPricingCatalogItemBySlug("custom");
      await createPricingMarketPrice({
        pricingCatalogId: ecommerce!.id,
        marketId: euMarket.id,
        currency: "EUR",
        priceType: "FROM",
        price: 2299,
        isActive: true,
      });
      await createPricingMarketPrice({
        pricingCatalogId: ecommerce!.id,
        marketId: usMarket.id,
        currency: "USD",
        priceType: "FROM",
        price: 2659,
        isActive: true,
      });
      await createPricingMarketPrice({
        pricingCatalogId: custom!.id,
        marketId: euMarket.id,
        currency: "EUR",
        priceType: "FROM",
        price: 4199,
        isActive: true,
      });
      await createPricingMarketPrice({
        pricingCatalogId: custom!.id,
        marketId: usMarket.id,
        currency: "USD",
        priceType: "FROM",
        price: 4859,
        isActive: true,
      });
    });

    it("2. EU + EUR + plan=ecommerce → €2.299 exacto, marketCode='EU'", async () => {
      resolveCommercialMarketMock.mockResolvedValue({ market: euMarket, source: "explicit_cookie" });
      resolveDisplayCurrencyMock.mockResolvedValue({ currency: "EUR", source: "market_default" });

      const payload = makePayload({ plan: "ecommerce" });
      const res = await POST(makeRequest(payload, uniqueHeaders()));
      expect(res.status).toBe(200);

      const saved = await findSaved(payload.email);
      expect(saved?.marketCode).toBe("EU");
      expect(saved?.displayCurrency).toBe("EUR");
      expect(saved?.officialAmount).toBe(2299);
      expect(saved?.officialCurrency).toBe("EUR");
    });

    it("3. EU market + USD display currency + plan=ecommerce → $2.659 exacto (precio explícito del hermano US, NUNCA calculado vía exchange_rates), Commercial Market sigue siendo EU", async () => {
      resolveCommercialMarketMock.mockResolvedValue({ market: euMarket, source: "explicit_cookie" });
      resolveDisplayCurrencyMock.mockResolvedValue({ currency: "USD", source: "explicit_cookie" });

      const payload = makePayload({ plan: "ecommerce" });
      const res = await POST(makeRequest(payload, uniqueHeaders()));
      expect(res.status).toBe(200);

      const saved = await findSaved(payload.email);
      expect(saved?.marketCode).toBe("EU"); // el Commercial Market NUNCA cambia por elegir otra moneda
      expect(saved?.displayCurrency).toBe("USD");
      expect(saved?.officialAmount).toBe(2659);
      expect(saved?.officialCurrency).toBe("USD");
    });

    it("4. US + USD + plan=custom → $4.859 exacto (precio propio, sin conversión)", async () => {
      resolveCommercialMarketMock.mockResolvedValue({ market: usMarket, source: "explicit_cookie" });
      resolveDisplayCurrencyMock.mockResolvedValue({ currency: "USD", source: "market_default" });

      const payload = makePayload({ plan: "custom" });
      const res = await POST(makeRequest(payload, uniqueHeaders()));
      expect(res.status).toBe(200);

      const saved = await findSaved(payload.email);
      expect(saved?.marketCode).toBe("US");
      expect(saved?.officialAmount).toBe(4_859);
      expect(saved?.officialCurrency).toBe("USD");
    });

    it("5. US market + EUR display currency + plan=custom → €4.199 exacto (precio explícito del hermano EU), Commercial Market sigue siendo US", async () => {
      resolveCommercialMarketMock.mockResolvedValue({ market: usMarket, source: "explicit_cookie" });
      resolveDisplayCurrencyMock.mockResolvedValue({ currency: "EUR", source: "explicit_cookie" });

      const payload = makePayload({ plan: "custom" });
      const res = await POST(makeRequest(payload, uniqueHeaders()));
      expect(res.status).toBe(200);

      const saved = await findSaved(payload.email);
      expect(saved?.marketCode).toBe("US");
      expect(saved?.displayCurrency).toBe("EUR");
      expect(saved?.officialAmount).toBe(4_199);
      expect(saved?.officialCurrency).toBe("EUR");
    });

    it("EU + E-COMMERCE + EUR → 2299 EUR / EU + E-COMMERCE + USD → 2659 USD / EU + CUSTOM + EUR → 4199 EUR / EU + CUSTOM + USD → 4859 USD (matriz completa pedida)", async () => {
      resolveCommercialMarketMock.mockResolvedValue({ market: euMarket, source: "explicit_cookie" });

      resolveDisplayCurrencyMock.mockResolvedValue({ currency: "EUR", source: "market_default" });
      let payload = makePayload({ plan: "ecommerce" });
      await POST(makeRequest(payload, uniqueHeaders()));
      expect((await findSaved(payload.email))?.officialAmount).toBe(2299);
      expect((await findSaved(payload.email))?.officialCurrency).toBe("EUR");

      resolveDisplayCurrencyMock.mockResolvedValue({ currency: "USD", source: "explicit_cookie" });
      payload = makePayload({ plan: "ecommerce" });
      await POST(makeRequest(payload, uniqueHeaders()));
      expect((await findSaved(payload.email))?.officialAmount).toBe(2659);
      expect((await findSaved(payload.email))?.officialCurrency).toBe("USD");

      resolveDisplayCurrencyMock.mockResolvedValue({ currency: "EUR", source: "market_default" });
      payload = makePayload({ plan: "custom" });
      await POST(makeRequest(payload, uniqueHeaders()));
      expect((await findSaved(payload.email))?.officialAmount).toBe(4199);
      expect((await findSaved(payload.email))?.officialCurrency).toBe("EUR");

      resolveDisplayCurrencyMock.mockResolvedValue({ currency: "USD", source: "explicit_cookie" });
      payload = makePayload({ plan: "custom" });
      await POST(makeRequest(payload, uniqueHeaders()));
      expect((await findSaved(payload.email))?.officialAmount).toBe(4859);
      expect((await findSaved(payload.email))?.officialCurrency).toBe("USD");
    });
  });

  it("7. sin ?plan → pricingCatalogId, officialAmount y officialCurrency null; marketCode/displayCurrency SÍ se capturan", async () => {
    const market = { ...DEFAULT_TEST_MARKET, code: "OTHER", currency: "COP" };
    resolveCommercialMarketMock.mockResolvedValue({ market, source: "default" });
    resolveDisplayCurrencyMock.mockResolvedValue({ currency: "COP", source: "market_default" });

    const payload = makePayload(); // sin plan
    const res = await POST(makeRequest(payload, uniqueHeaders()));
    expect(res.status).toBe(200);

    const saved = await findSaved(payload.email);
    expect(saved?.pricingCatalogId).toBeNull();
    expect(saved?.officialAmount).toBeNull();
    expect(saved?.officialCurrency).toBeNull();
    expect(saved?.marketCode).toBe("OTHER");
    expect(saved?.displayCurrency).toBe("COP");
  });

  it("8. displayCurrency manipulada en el body del request → ignorada por completo, el servidor solo confía en resolveDisplayCurrency()", async () => {
    resolveCommercialMarketMock.mockResolvedValue({ market: coMarket, source: "explicit_cookie" });
    resolveDisplayCurrencyMock.mockResolvedValue({ currency: "COP", source: "market_default" });

    // El cliente intenta inyectar displayCurrency/currency en el payload —
    // contactSchema ni siquiera define estos campos, así que un
    // safeParse() los descarta silenciosamente (Zod, por defecto, ignora
    // llaves desconocidas) — nunca llegan a `data`.
    const payload = makePayload({ displayCurrency: "USD", currency: "USD" });
    const res = await POST(makeRequest(payload, uniqueHeaders()));
    expect(res.status).toBe(200);

    const saved = await findSaved(payload.email as string);
    expect(saved?.displayCurrency).toBe("COP"); // nunca "USD"
  });

  it("9. intento de manipular market/price directamente en el body → estructuralmente ignorado, el precio persistido viene SIEMPRE de Pricing Core, nunca del cliente", async () => {
    const manipEuMarket = await createPricingMarket({
      code: `MANIP-EU-${Date.now()}`,
      name: "Manipulation test EU",
      currency: "EUR",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const ecommerce = await getPricingCatalogItemBySlug("ecommerce");
    await createPricingMarketPrice({
      pricingCatalogId: ecommerce!.id,
      marketId: manipEuMarket.id,
      currency: "EUR",
      priceType: "FROM",
      price: 2299,
      isActive: true,
    });
    resolveCommercialMarketMock.mockResolvedValue({ market: manipEuMarket, source: "explicit_cookie" });
    resolveDisplayCurrencyMock.mockResolvedValue({ currency: "EUR", source: "market_default" });

    // El cliente intenta afirmar un mercado/precio distinto directamente
    // en el body — un atacante que conozca la matriz de precios podría
    // intentar esto para que quede "registrado" un precio más barato.
    const payload = makePayload({
      plan: "ecommerce",
      market: "US",
      marketCode: "US",
      officialAmount: 1,
      officialCurrency: "COP",
      price: 1,
    });
    const res = await POST(makeRequest(payload, uniqueHeaders()));
    expect(res.status).toBe(200);

    const saved = await findSaved(payload.email as string);
    // El único resultado posible es el que Pricing Core realmente resolvió
    // para el mercado EU real (mockeado como el mercado activo) — nunca
    // "US"/1/COP, sin importar qué haya enviado el cliente en el body.
    expect(saved?.marketCode).toBe(manipEuMarket.code);
    expect(saved?.officialAmount).toBe(2299);
    expect(saved?.officialCurrency).toBe("EUR");
  });
});
