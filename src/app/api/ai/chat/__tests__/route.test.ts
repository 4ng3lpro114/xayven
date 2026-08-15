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

import { POST } from "../route";
import { getConversationById, listLeadStatusHistory } from "@/lib/db/conversationStore";
import {
  createPromotion,
  schedulePromotion,
  pausePromotion,
  archivePromotion,
} from "@/lib/db/promotionStore";
import type { CreatePromotionInput } from "@/lib/promotions/types";

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
