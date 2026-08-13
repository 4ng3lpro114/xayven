import { describe, it, expect } from "vitest";
import { createPromotionSchema, validateFinalPromotionShape } from "@/lib/promotions/validation";

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Promoción de agosto",
    text: "🔥 ¡20% de descuento!",
    discountType: "percentage",
    discountValue: 20,
    currency: null,
    startAt: "2026-08-15T00:00:00.000Z",
    endAt: "2026-08-31T00:00:00.000Z",
    audience: "all",
    ctaLabel: "Quiero aprovecharla",
    ...overrides,
  };
}

describe("createPromotionSchema — campos obligatorios", () => {
  it("acepta un body válido completo", () => {
    const result = createPromotionSchema.safeParse(baseBody());
    expect(result.success).toBe(true);
  });

  it("nombre vacío → rechazado", () => {
    expect(createPromotionSchema.safeParse(baseBody({ name: "" })).success).toBe(false);
  });

  it("texto vacío → rechazado", () => {
    expect(createPromotionSchema.safeParse(baseBody({ text: "" })).success).toBe(false);
  });

  it("CTA vacío → rechazado", () => {
    expect(createPromotionSchema.safeParse(baseBody({ ctaLabel: "" })).success).toBe(false);
  });

  it("descuento <= 0 → rechazado", () => {
    expect(createPromotionSchema.safeParse(baseBody({ discountValue: 0 })).success).toBe(false);
    expect(createPromotionSchema.safeParse(baseBody({ discountValue: -5 })).success).toBe(false);
  });

  it("ctaMessage: ausente → válido (opcional, no forma parte de 'CTA obligatorio' — eso es ctaLabel)", () => {
    const result = createPromotionSchema.safeParse(baseBody());
    expect(result.success).toBe(true);
  });

  it("ctaMessage: null explícito → válido", () => {
    expect(createPromotionSchema.safeParse(baseBody({ ctaMessage: null })).success).toBe(true);
  });

  it("ctaMessage: dentro del límite de 300 caracteres → válido", () => {
    const result = createPromotionSchema.safeParse(
      baseBody({ ctaMessage: "Hola, quiero aprovechar la promoción de agosto del 20%." })
    );
    expect(result.success).toBe(true);
  });

  it("ctaMessage: más de 300 caracteres → rechazado (mismo criterio de longitud razonable que el resto de los textos)", () => {
    const result = createPromotionSchema.safeParse(baseBody({ ctaMessage: "x".repeat(301) }));
    expect(result.success).toBe(false);
  });

  it("fecha inválida (no parseable) → rechazada", () => {
    expect(createPromotionSchema.safeParse(baseBody({ startAt: "no-es-una-fecha" })).success).toBe(false);
  });

  it("tipo de descuento fuera del enum → rechazado", () => {
    expect(createPromotionSchema.safeParse(baseBody({ discountType: "bogo" })).success).toBe(false);
  });

  it("audiencia fuera del enum → rechazada", () => {
    expect(createPromotionSchema.safeParse(baseBody({ audience: "vip" })).success).toBe(false);
  });
});

describe("validateFinalPromotionShape — reglas cruzadas", () => {
  it("porcentaje válido (<=100) → sin errores", () => {
    const errors = validateFinalPromotionShape({
      discountType: "percentage",
      discountValue: 100,
      currency: null,
      startAt: "2026-08-15T00:00:00.000Z",
      endAt: "2026-08-31T00:00:00.000Z",
    });
    expect(errors).toEqual({});
  });

  it("porcentaje > 100 → rechazado", () => {
    const errors = validateFinalPromotionShape({
      discountType: "percentage",
      discountValue: 150,
      currency: null,
      startAt: "2026-08-15T00:00:00.000Z",
      endAt: "2026-08-31T00:00:00.000Z",
    });
    expect(errors.discountValue).toBeDefined();
  });

  it("end_at antes de start_at → rechazado", () => {
    const errors = validateFinalPromotionShape({
      discountType: "percentage",
      discountValue: 20,
      currency: null,
      startAt: "2026-08-31T00:00:00.000Z",
      endAt: "2026-08-15T00:00:00.000Z",
    });
    expect(errors.endAt).toBeDefined();
  });

  it("end_at igual a start_at → rechazado (debe ser estrictamente posterior)", () => {
    const errors = validateFinalPromotionShape({
      discountType: "percentage",
      discountValue: 20,
      currency: null,
      startAt: "2026-08-15T00:00:00.000Z",
      endAt: "2026-08-15T00:00:00.000Z",
    });
    expect(errors.endAt).toBeDefined();
  });

  it("fixed_amount sin moneda → rechazado", () => {
    const errors = validateFinalPromotionShape({
      discountType: "fixed_amount",
      discountValue: 100000,
      currency: null,
      startAt: "2026-08-15T00:00:00.000Z",
      endAt: "2026-08-31T00:00:00.000Z",
    });
    expect(errors.currency).toBeDefined();
  });

  it("percentage CON moneda → rechazado (no debería llevar)", () => {
    const errors = validateFinalPromotionShape({
      discountType: "percentage",
      discountValue: 20,
      currency: "COP",
      startAt: "2026-08-15T00:00:00.000Z",
      endAt: "2026-08-31T00:00:00.000Z",
    });
    expect(errors.currency).toBeDefined();
  });

  it("special_price con moneda y fechas válidas → sin errores", () => {
    const errors = validateFinalPromotionShape({
      discountType: "special_price",
      discountValue: 500000,
      currency: "COP",
      startAt: "2026-08-15T00:00:00.000Z",
      endAt: "2026-08-31T00:00:00.000Z",
    });
    expect(errors).toEqual({});
  });
});
