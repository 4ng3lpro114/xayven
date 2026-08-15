import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../knowledge";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { PublicPromotion } from "@/lib/promotions/types";

function makePublicPromotion(overrides: Partial<PublicPromotion> = {}): PublicPromotion {
  return {
    id: "promo-1",
    text: "🔥 ¡20% de descuento durante agosto!",
    discountType: "percentage",
    discountValue: 20,
    currency: null,
    startAt: "2026-08-01T00:00:00.000Z",
    endAt: "2026-08-31T23:59:59.000Z",
    ctaLabel: "Quiero aprovecharla",
    ctaMessage: null,
    ...overrides,
  };
}

describe("buildSystemPrompt — contexto de promoción (Fase 11 Etapa A)", () => {
  it("sin promoción activa (el caso común, sin cambios) → nunca incluye el bloque ACTIVE PROMOTION", async () => {
    const dict = await getDictionary("es");
    const prompt = buildSystemPrompt(dict, "es");

    expect(prompt).not.toContain("ACTIVE PROMOTION");
  });

  it("activePromotion=null explícito → mismo resultado que omitirlo", async () => {
    const dict = await getDictionary("es");
    const prompt = buildSystemPrompt(dict, "es", null);

    expect(prompt).not.toContain("ACTIVE PROMOTION");
  });

  it("con promoción activa → incluye el copy real, el beneficio formateado y la fecha de vigencia", async () => {
    const dict = await getDictionary("es");
    const promotion = makePublicPromotion();

    const prompt = buildSystemPrompt(dict, "es", promotion);

    expect(prompt).toContain("ACTIVE PROMOTION");
    expect(prompt).toContain("🔥 ¡20% de descuento durante agosto!");
    expect(prompt).toContain("20%"); // formatPromotionDiscount() reused, no lógica de formato duplicada
  });

  it("descuento de monto fijo → reutiliza formatPromotionDiscount(), nunca reconstruye el formato aquí", async () => {
    const dict = await getDictionary("es");
    const promotion = makePublicPromotion({
      discountType: "fixed_amount",
      discountValue: 100000,
      currency: "COP",
    });

    const prompt = buildSystemPrompt(dict, "es", promotion);

    expect(prompt).toMatch(/-\$?100[.,]?000/); // mismo formatMoney() que el admin, no un formato ad hoc
  });

  it("instruye explícitamente a no inventar otros descuentos ni prometer más de lo indicado", async () => {
    const dict = await getDictionary("es");
    const prompt = buildSystemPrompt(dict, "es", makePublicPromotion());

    expect(prompt).toMatch(/never invent a different discount/i);
  });

  it("J. nunca expone campos administrativos — PublicPromotion no tiene name/audience/metadata, así que no pueden aparecer", async () => {
    const dict = await getDictionary("es");
    const promotion = makePublicPromotion();
    const prompt = buildSystemPrompt(dict, "es", promotion);

    // PublicPromotion (types.ts) estructuralmente no tiene estos campos —
    // esta prueba documenta esa garantía en el prompt final, no solo en el
    // tipo.
    expect(prompt).not.toMatch(/"name"|"audience"|"metadata"|"audienceRules"/);
  });
});
