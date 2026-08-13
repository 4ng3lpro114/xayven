import { describe, it, expect } from "vitest";
import { getEffectivePromotionStatus } from "@/lib/promotions/effectiveStatus";
import type { Promotion, PromotionStatus } from "@/lib/promotions/types";

const NOW = new Date("2026-08-20T12:00:00.000Z");

function iso(daysFromNow: number): string {
  return new Date(NOW.getTime() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
}

function makePromotion(
  status: PromotionStatus,
  startAt: string,
  endAt: string
): Pick<Promotion, "status" | "startAt" | "endAt"> {
  return { status, startAt, endAt };
}

describe("getEffectivePromotionStatus — draft y paused son absolutos", () => {
  it("draft nunca es 'active' aunque las fechas ya hayan llegado", () => {
    const p = makePromotion("draft", iso(-10), iso(10));
    expect(getEffectivePromotionStatus(p, NOW)).toBe("draft");
  });

  it("draft nunca es 'active' aunque las fechas hayan pasado", () => {
    const p = makePromotion("draft", iso(-20), iso(-10));
    expect(getEffectivePromotionStatus(p, NOW)).toBe("draft");
  });

  it("paused nunca es 'active' mientras esté pausada, sin importar las fechas", () => {
    const p = makePromotion("paused", iso(-10), iso(10));
    expect(getEffectivePromotionStatus(p, NOW)).toBe("paused");
  });

  it("archived nunca es visible/activa, es terminal", () => {
    const p = makePromotion("archived", iso(-10), iso(10));
    expect(getEffectivePromotionStatus(p, NOW)).toBe("archived");
  });
});

describe("getEffectivePromotionStatus — scheduled: las fechas deciden", () => {
  it("antes de start_at → 'scheduled' (Programada)", () => {
    const p = makePromotion("scheduled", iso(5), iso(15));
    expect(getEffectivePromotionStatus(p, NOW)).toBe("scheduled");
  });

  it("entre start_at y end_at → 'active' (Activa)", () => {
    const p = makePromotion("scheduled", iso(-5), iso(5));
    expect(getEffectivePromotionStatus(p, NOW)).toBe("active");
  });

  it("después de end_at → 'expired' (Finalizada)", () => {
    const p = makePromotion("scheduled", iso(-15), iso(-5));
    expect(getEffectivePromotionStatus(p, NOW)).toBe("expired");
  });

  it("una promoción programada HOY para empezar YA se activa sola, sin cron — solo comparando fechas", () => {
    const startsInPast = makePromotion("scheduled", iso(-0.001), iso(10));
    expect(getEffectivePromotionStatus(startsInPast, NOW)).toBe("active");
  });
});
