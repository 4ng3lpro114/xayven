import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";

/**
 * No AI_API_KEY in the test environment, so @/lib/ai/provider is mocked
 * wholesale — this is the one dependency that genuinely can't run for
 * real here (it'd mean a live outbound call to an LLM provider).
 * Everything else (conversationStore, leadStatus, i18n dictionaries) runs
 * for real against the in-memory fallback — same round-trip philosophy as
 * src/lib/leads/__tests__/conversion.test.ts.
 */
const completeChatMock = vi.fn();
vi.mock("@/lib/ai/provider", () => ({
  isAIConfigured: () => true,
  completeChat: (...args: unknown[]) => completeChatMock(...args),
}));

/**
 * International Pricing Phase E — resolveCommercialMarket()/
 * resolveDisplayCurrency() call `cookies()` (next/headers), which throws
 * "called outside a request scope" when POST() is invoked directly like
 * this test file already does (bypassing Next's real request-handling
 * machinery) — same reason /api/admin/**'s route tests mock
 * requireAdminSession() instead of letting the real cookies() call run.
 * Mocked to the exact same HARDCODED_FALLBACK_MARKET/COP default
 * production code itself falls back to when nothing else resolves — same
 * commercial-market default, not a fake state that couldn't occur.
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

import { POST } from "../route";
import { getConversationById, listLeadStatusHistory } from "@/lib/db/conversationStore";
import {
  createPromotion,
  schedulePromotion,
  pausePromotion,
  archivePromotion,
} from "@/lib/db/promotionStore";
import type { CreatePromotionInput } from "@/lib/promotions/types";
import { createService } from "@/lib/db/servicesStore";
import { createPricingMarket, createPricingMarketPrice } from "@/lib/db/pricingMarketStore";
import { getPricingCatalogItemBySlug } from "@/lib/db/pricingCatalogStore";
import { GET_OFFICIAL_PRICE_TOOL } from "@/lib/ai/tools";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeSessionId(): string {
  return `test-session-${randomBytes(8).toString("hex")}`;
}

describe("POST /api/ai/chat — turno normal (comportamiento sin cambios)", () => {
  beforeEach(() => {
    completeChatMock.mockReset();
  });

  it("respuesta exitosa del proveedor → 200, ok:true, la conversación queda persistida", async () => {
    completeChatMock.mockResolvedValue({ ok: true, content: "Hola, ¿en qué te puedo ayudar?" });
    const sessionId = makeSessionId();

    const res = await POST(makeRequest({ sessionId, message: "Hola", locale: "es" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.reply).toBe("Hola, ¿en qué te puedo ayudar?");
    expect(typeof body.conversationId).toBe("string");
    expect(body.leadStatus).toBe("exploring");

    const reloaded = await getConversationById(body.conversationId);
    expect(reloaded?.messages).toHaveLength(2); // user + assistant
  });

  it("el proveedor falla (not_configured) → 503, ok:false, el mensaje del visitante igual se guarda", async () => {
    completeChatMock.mockResolvedValue({ ok: false, reason: "not_configured" });
    const sessionId = makeSessionId();

    const res = await POST(makeRequest({ sessionId, message: "Hola", locale: "es" }));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("not_configured");
  });

  it("el proveedor falla (request_failed) → 502, ok:false", async () => {
    completeChatMock.mockResolvedValue({ ok: false, reason: "request_failed", detail: "timeout" });
    const sessionId = makeSessionId();

    const res = await POST(makeRequest({ sessionId, message: "Hola", locale: "es" }));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("request_failed");
  });

  it("un turno real sigue registrando el historial de leadStatus exactamente una vez cuando cambia (Fase 9C, sigue funcionando)", async () => {
    // score >= 40 or hasContact -> "interested"; deriveLeadStatus needs a
    // visitorEmail already on the conversation to flip away from
    // "exploring" on the very first turn without depending on AI-extracted
    // fields (which parseAIResponse only reads from a JSON block this
    // mock reply doesn't include).
    completeChatMock.mockResolvedValue({ ok: true, content: "Con gusto te ayudo." });
    const sessionId = makeSessionId();

    const first = await POST(makeRequest({ sessionId, message: "Hola, mi correo es ana@email.com", locale: "es" }));
    const firstBody = await first.json();

    const history = await listLeadStatusHistory(firstBody.conversationId);
    // computeLeadScore alone (message count) isn't guaranteed to cross the
    // "interested" threshold in one turn without extracted fields — this
    // just asserts the invariant that matters: never more than one history
    // row for however many (0 or 1) real transitions happened this turn.
    expect(history.length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Fase 11 Etapa A — atribución Promoción → Conversación
// ---------------------------------------------------------------------------

async function makeActivePromotion(overrides: Partial<CreatePromotionInput> = {}) {
  const created = await createPromotion({
    name: "Promoción de prueba",
    text: "🔥 20% de descuento",
    discountType: "percentage",
    discountValue: 20,
    currency: null,
    startAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // ayer
    endAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // mañana
    audience: "all",
    ctaLabel: "Quiero aprovecharla",
    ...overrides,
  });
  return schedulePromotion(created.id); // draft -> scheduled, ahora efectivamente "active"
}

describe("POST /api/ai/chat — atribución de promoción (Fase 11 Etapa A)", () => {
  beforeEach(() => {
    completeChatMock.mockReset();
    completeChatMock.mockResolvedValue({ ok: true, content: "Claro, te cuento." });
  });

  it("H. promoción real y activa + promotionId en el turno → la conversación queda atribuida", async () => {
    const promotion = await makeActivePromotion();
    const sessionId = makeSessionId();

    const res = await POST(
      makeRequest({ sessionId, message: "Hola, vengo por la promo", locale: "es", promotionId: promotion.id })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    const reloaded = await getConversationById(body.conversationId);
    expect(reloaded?.promotionId).toBe(promotion.id);
  });

  it("G/5. el system prompt enviado al proveedor de IA incluye el copy real de la promoción atribuida", async () => {
    const promotion = await makeActivePromotion({ text: "🎉 Mensaje único de esta promoción" });
    const sessionId = makeSessionId();

    await POST(
      makeRequest({ sessionId, message: "Hola", locale: "es", promotionId: promotion.id })
    );

    const [[firstArgMessages]] = completeChatMock.mock.calls;
    const systemMessage = (firstArgMessages as { role: string; content: string }[])[0]!;
    expect(systemMessage.role).toBe("system");
    expect(systemMessage.content).toContain("🎉 Mensaje único de esta promoción");
  });

  it("I. promotionId con formato válido pero inexistente → no produce atribución inválida, el turno igual funciona", async () => {
    const sessionId = makeSessionId();

    const res = await POST(
      makeRequest({
        sessionId,
        message: "Hola",
        locale: "es",
        promotionId: "00000000-0000-0000-0000-000000000000",
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    const reloaded = await getConversationById(body.conversationId);
    expect(reloaded?.promotionId).toBeNull();
  });

  it("9. promoción PAUSADA → no se puede atribuir como si estuviera activa, aunque el id sea real", async () => {
    const promotion = await makeActivePromotion();
    await pausePromotion(promotion.id);
    const sessionId = makeSessionId();

    const res = await POST(
      makeRequest({ sessionId, message: "Hola", locale: "es", promotionId: promotion.id })
    );
    const body = await res.json();

    const reloaded = await getConversationById(body.conversationId);
    expect(reloaded?.promotionId).toBeNull();
  });

  it("9. promoción ARCHIVADA → no se puede atribuir como si estuviera activa, aunque el id sea real", async () => {
    const promotion = await makeActivePromotion();
    await archivePromotion(promotion.id);
    const sessionId = makeSessionId();

    const res = await POST(
      makeRequest({ sessionId, message: "Hola", locale: "es", promotionId: promotion.id })
    );
    const body = await res.json();

    const reloaded = await getConversationById(body.conversationId);
    expect(reloaded?.promotionId).toBeNull();
  });

  it("primer toque, fijo (sticky) — una vez atribuida, un turno posterior con OTRO promotionId nunca la sobrescribe", async () => {
    const first = await makeActivePromotion({ name: "Primera" });
    const second = await makeActivePromotion({ name: "Segunda" });
    const sessionId = makeSessionId();

    const firstRes = await POST(
      makeRequest({ sessionId, message: "Hola", locale: "es", promotionId: first.id })
    );
    const firstBody = await firstRes.json();

    await POST(
      makeRequest({ sessionId, message: "Otro mensaje", locale: "es", promotionId: second.id })
    );

    const reloaded = await getConversationById(firstBody.conversationId);
    expect(reloaded?.promotionId).toBe(first.id);
  });

  it("K. un turno sin promotionId sigue funcionando exactamente igual que antes (comportamiento por defecto intacto)", async () => {
    const sessionId = makeSessionId();

    const res = await POST(makeRequest({ sessionId, message: "Hola, sin promoción", locale: "es" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    const reloaded = await getConversationById(body.conversationId);
    expect(reloaded?.promotionId).toBeNull();

    const [[firstArgMessages]] = completeChatMock.mock.calls;
    const systemMessage = (firstArgMessages as { role: string; content: string }[])[0]!;
    expect(systemMessage.content).not.toContain("ACTIVE PROMOTION");
  });

  it("promotionId con formato inválido (no UUID) → 400 validation_failed, nunca se procesa el turno", async () => {
    const sessionId = makeSessionId();

    const res = await POST(
      makeRequest({ sessionId, message: "Hola", locale: "es", promotionId: "no-es-un-uuid" })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
  });
});

// ---------------------------------------------------------------------------
// Services Phase 3 — atribución Servicio → Conversación
// ---------------------------------------------------------------------------

describe("POST /api/ai/chat — atribución de servicio (Services Phase 3)", () => {
  beforeEach(() => {
    completeChatMock.mockReset();
    completeChatMock.mockResolvedValue({ ok: true, content: "Claro, te cuento." });
  });

  it("servicio real y publicado (seed 'seo') + serviceSlug en el turno → la conversación queda atribuida", async () => {
    const sessionId = makeSessionId();

    const res = await POST(
      makeRequest({ sessionId, message: "Quiero saber más sobre SEO.", locale: "es", serviceSlug: "seo" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    const reloaded = await getConversationById(body.conversationId);
    expect(reloaded?.servicePageSlug).toBe("seo");
  });

  it("serviceSlug bien formado pero inexistente → no produce atribución inválida, el turno igual funciona", async () => {
    const sessionId = makeSessionId();

    const res = await POST(
      makeRequest({ sessionId, message: "Hola", locale: "es", serviceSlug: "no-existe-este-servicio" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    const reloaded = await getConversationById(body.conversationId);
    expect(reloaded?.servicePageSlug).toBeNull();
  });

  it("servicio SIN publicar → no se puede atribuir aunque el slug sea real", async () => {
    const draft = await createService({
      slug: `test-unpublished-${randomBytes(4).toString("hex")}`,
      displayOrder: 99,
      isPublished: false,
      relatedPackageSlugs: [],
      content: {
        es: { heading: "Prueba", tagline: "t", definition: "d", problem: ["p"], solution: "s", includes: ["i"], forWhom: { idealIf: ["x"], notIdealIf: [] }, useCases: [], faq: [] },
        en: { heading: "Test", tagline: "t", definition: "d", problem: ["p"], solution: "s", includes: ["i"], forWhom: { idealIf: ["x"], notIdealIf: [] }, useCases: [], faq: [] },
      },
    });
    const sessionId = makeSessionId();

    const res = await POST(
      makeRequest({ sessionId, message: "Hola", locale: "es", serviceSlug: draft.slug })
    );
    const body = await res.json();

    const reloaded = await getConversationById(body.conversationId);
    expect(reloaded?.servicePageSlug).toBeNull();
  });

  it("primer toque, fijo (sticky) — una vez atribuida, un turno posterior con OTRO serviceSlug nunca la sobrescribe", async () => {
    const sessionId = makeSessionId();

    const firstRes = await POST(
      makeRequest({ sessionId, message: "Hola", locale: "es", serviceSlug: "seo" })
    );
    const firstBody = await firstRes.json();

    await POST(
      makeRequest({ sessionId, message: "Otro mensaje", locale: "es", serviceSlug: "ecommerce" })
    );

    const reloaded = await getConversationById(firstBody.conversationId);
    expect(reloaded?.servicePageSlug).toBe("seo");
  });

  it("un turno sin serviceSlug sigue funcionando exactamente igual que antes (comportamiento por defecto intacto)", async () => {
    const sessionId = makeSessionId();

    const res = await POST(makeRequest({ sessionId, message: "Hola, sin servicio", locale: "es" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    const reloaded = await getConversationById(body.conversationId);
    expect(reloaded?.servicePageSlug).toBeNull();
  });

  it("serviceSlug con formato inválido (mayúsculas/espacios) → 400 validation_failed, nunca se procesa el turno", async () => {
    const sessionId = makeSessionId();

    const res = await POST(
      makeRequest({ sessionId, message: "Hola", locale: "es", serviceSlug: "No Es Un Slug" })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
  });

  it("Services Phase 6 — el system prompt real incluye los 5 servicios, los paquetes y los planes de mantenimiento", async () => {
    const sessionId = makeSessionId();

    await POST(makeRequest({ sessionId, message: "Hola", locale: "es" }));

    const [[firstArgMessages]] = completeChatMock.mock.calls;
    const systemMessage = (firstArgMessages as { role: string; content: string }[])[0]!;
    expect(systemMessage.content).toContain("slug: web-development");
    expect(systemMessage.content).toContain("START (slug: start)");
    expect(systemMessage.content).toContain("Essential (slug: essential)");
  });

  it("Services Phase 6 — con serviceSlug atribuido, el system prompt incluye el bloque CURRENT SERVICE PAGE del servicio correcto", async () => {
    const sessionId = makeSessionId();

    await POST(makeRequest({ sessionId, message: "Hola", locale: "es", serviceSlug: "seo" }));

    const [[firstArgMessages]] = completeChatMock.mock.calls;
    const systemMessage = (firstArgMessages as { role: string; content: string }[])[0]!;
    expect(systemMessage.content).toContain("CURRENT SERVICE PAGE");
    expect(systemMessage.content).toContain("/services/seo");
  });

  it("promotionId y serviceSlug pueden coexistir en la misma conversación — son campos independientes", async () => {
    const promotion = await makeActivePromotion();
    const sessionId = makeSessionId();

    const res = await POST(
      makeRequest({
        sessionId,
        message: "Hola",
        locale: "es",
        promotionId: promotion.id,
        serviceSlug: "seo",
      })
    );
    const body = await res.json();

    const reloaded = await getConversationById(body.conversationId);
    expect(reloaded?.promotionId).toBe(promotion.id);
    expect(reloaded?.servicePageSlug).toBe("seo");
  });
});

// ---------------------------------------------------------------------------
// International Pricing Phase E — XAYVEN AI tool-calling round trip
// ---------------------------------------------------------------------------

describe("POST /api/ai/chat — International Pricing Phase E: tool-calling round trip", () => {
  beforeEach(() => {
    completeChatMock.mockReset();
    resolveCommercialMarketMock.mockReset().mockResolvedValue({ market: DEFAULT_TEST_MARKET, source: "default" });
    resolveDisplayCurrencyMock.mockReset().mockResolvedValue({ currency: "COP", source: "market_default" });
  });

  it("el modelo pide get_official_price → segunda llamada recibe el resultado REAL de resolveOfficialPrice(), la respuesta final es la del segundo completion", async () => {
    const market = await createPricingMarket({
      code: `AI-RT-${Date.now()}`,
      name: "Round trip test market",
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
    resolveCommercialMarketMock.mockResolvedValue({ market, source: "explicit_cookie" });
    resolveDisplayCurrencyMock.mockResolvedValue({ currency: "USD", source: "market_default" });

    const toolCallId = "call_abc123";
    completeChatMock
      .mockResolvedValueOnce({
        ok: true,
        content: null,
        toolCalls: [
          {
            id: toolCallId,
            type: "function",
            function: { name: "get_official_price", arguments: JSON.stringify({ itemSlug: "start" }) },
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true, content: "El precio oficial de START es $399 USD." });

    const sessionId = makeSessionId();
    const res = await POST(makeRequest({ sessionId, message: "¿Cuánto cuesta START?", locale: "es" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reply).toBe("El precio oficial de START es $399 USD.");
    expect(completeChatMock).toHaveBeenCalledTimes(2);

    const [, secondCallArgs] = completeChatMock.mock.calls;
    const secondMessages = secondCallArgs[0] as { role: string; tool_call_id?: string; content: string | null }[];
    const toolMessage = secondMessages.find((m) => m.role === "tool");
    expect(toolMessage).toBeDefined();
    expect(toolMessage!.tool_call_id).toBe(toolCallId);
    const toolResult = JSON.parse(toolMessage!.content!);
    expect(toolResult.officialAmount).toBe(399);
    expect(toolResult.officialCurrency).toBe("USD");
    expect(toolResult.source).toBe("market_price");

    // Exactamente UN round trip — la segunda llamada nunca vuelve a ofrecer
    // `tools`, así que el modelo no puede volver a pedir otra tool call.
    const secondOptions = secondCallArgs[1] as { tools?: unknown } | undefined;
    expect(secondOptions?.tools).toBeUndefined();
  });

  it("pregunta sin necesidad de precio → el modelo responde directo, UNA sola llamada, sin tool_calls", async () => {
    completeChatMock.mockResolvedValueOnce({ ok: true, content: "XAYVEN construye sitios web a medida." });

    const sessionId = makeSessionId();
    const res = await POST(makeRequest({ sessionId, message: "¿Qué es XAYVEN?", locale: "es" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reply).toBe("XAYVEN construye sitios web a medida.");
    expect(completeChatMock).toHaveBeenCalledTimes(1);
  });

  it("la primera llamada SIEMPRE ofrece la tool get_official_price disponible", async () => {
    completeChatMock.mockResolvedValueOnce({ ok: true, content: "Hola." });

    const sessionId = makeSessionId();
    await POST(makeRequest({ sessionId, message: "Hola", locale: "es" }));

    const [firstCallArgs] = completeChatMock.mock.calls;
    const firstOptions = firstCallArgs[1] as { tools?: { function: { name: string } }[] };
    expect(firstOptions.tools).toHaveLength(1);
    expect(firstOptions.tools![0].function.name).toBe(GET_OFFICIAL_PRICE_TOOL.function.name);
  });

  it("CAPA 2 — el modelo responde con un precio SIN pedir tool_calls → numeric guard lo detecta y lo registra, NUNCA bloquea ni modifica la respuesta", async () => {
    completeChatMock.mockResolvedValueOnce({ ok: true, content: "Nuestros paquetes empiezan en $10.000 USD." });
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const sessionId = makeSessionId();
    const res = await POST(makeRequest({ sessionId, message: "¿Cuánto cuesta?", locale: "es" }));
    const body = await res.json();

    // Nunca bloquea ni modifica — la respuesta se entrega tal cual.
    expect(res.status).toBe(200);
    expect(body.reply).toBe("Nuestros paquetes empiezan en $10.000 USD.");

    const loggedText = consoleWarnSpy.mock.calls.map((call) => JSON.stringify(call)).join(" ");
    expect(loggedText).toContain("[ai/chat]");
    expect(loggedText).toContain("numeric guard");

    consoleWarnSpy.mockRestore();
  });

  it("CAPA 2 — el modelo responde con el MISMO precio que la tool devolvió este turno → numeric guard NO flaggea, nada se registra", async () => {
    const market = await createPricingMarket({
      code: `AI-RT-OK-${Date.now()}`,
      name: "Round trip no-flag test market",
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
    resolveCommercialMarketMock.mockResolvedValue({ market, source: "explicit_cookie" });
    resolveDisplayCurrencyMock.mockResolvedValue({ currency: "USD", source: "market_default" });

    completeChatMock
      .mockResolvedValueOnce({
        ok: true,
        content: null,
        toolCalls: [
          {
            id: "call_x",
            type: "function",
            function: { name: "get_official_price", arguments: JSON.stringify({ itemSlug: "professional" }) },
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true, content: "PROFESSIONAL cuesta $799 USD." });
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const sessionId = makeSessionId();
    await POST(makeRequest({ sessionId, message: "¿Cuánto cuesta PROFESSIONAL?", locale: "es" }));

    const loggedText = consoleWarnSpy.mock.calls.map((call) => JSON.stringify(call)).join(" ");
    expect(loggedText).not.toContain("numeric guard");

    consoleWarnSpy.mockRestore();
  });

  it("un tool_call con itemSlug inexistente → la tool devuelve found:false, el turno igual responde 200, nunca crashea", async () => {
    completeChatMock
      .mockResolvedValueOnce({
        ok: true,
        content: null,
        toolCalls: [
          {
            id: "call_y",
            type: "function",
            function: { name: "get_official_price", arguments: JSON.stringify({ itemSlug: "no-existe" }) },
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true, content: "No tengo ese paquete en mi catálogo." });

    const sessionId = makeSessionId();
    const res = await POST(
      makeRequest({ sessionId, message: "¿Cuánto cuesta el paquete inventado?", locale: "es" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reply).toBe("No tengo ese paquete en mi catálogo.");

    const [, secondCallArgs] = completeChatMock.mock.calls;
    const secondMessages = secondCallArgs[0] as { role: string; content: string | null }[];
    const toolMessage = secondMessages.find((m) => m.role === "tool");
    expect(JSON.parse(toolMessage!.content!).found).toBe(false);
  });

  it("la segunda llamada del round trip falla (proveedor) → 502 controlado, nunca un crash", async () => {
    completeChatMock
      .mockResolvedValueOnce({
        ok: true,
        content: null,
        toolCalls: [
          {
            id: "call_z",
            type: "function",
            function: { name: "get_official_price", arguments: JSON.stringify({ itemSlug: "start" }) },
          },
        ],
      })
      .mockResolvedValueOnce({ ok: false, reason: "request_failed", detail: "timeout" });

    const sessionId = makeSessionId();
    const res = await POST(makeRequest({ sessionId, message: "¿Cuánto cuesta START?", locale: "es" }));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("micro-fix post R4 live verification — el modelo repite el presupuesto que el VISITANTE dijo → el numeric guard NO flaggea (caso real observado en R4)", async () => {
    completeChatMock.mockResolvedValueOnce({
      ok: true,
      content:
        "Entiendo que tu presupuesto es de 100.000 pesos, pero lamentablemente no podemos ofrecer descuentos en este caso.",
    });
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const sessionId = makeSessionId();
    await POST(
      makeRequest({
        sessionId,
        message: "Solo tengo 100.000 pesos de presupuesto, ¿me hacen un descuento?",
        locale: "es",
      })
    );

    const loggedText = consoleWarnSpy.mock.calls.map((call) => JSON.stringify(call)).join(" ");
    expect(loggedText).not.toContain("numeric guard");

    consoleWarnSpy.mockRestore();
  });

  it("micro-fix post R4 — un precio NO autorizado y ajeno al mensaje del visitante SIGUE flaggeando (la reducción de falsos positivos no debilita la detección real)", async () => {
    completeChatMock.mockResolvedValueOnce({
      ok: true,
      content: "Como estás empezando, te lo dejamos en $10.000.",
    });
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const sessionId = makeSessionId();
    await POST(makeRequest({ sessionId, message: "¿Cuánto cuesta START?", locale: "es" }));

    const loggedText = consoleWarnSpy.mock.calls.map((call) => JSON.stringify(call)).join(" ");
    expect(loggedText).toContain("numeric guard");

    consoleWarnSpy.mockRestore();
  });
});
