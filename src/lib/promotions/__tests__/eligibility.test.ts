import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { matchesAudience, toPublicPromotion, getEligibleActivePromotions } from "@/lib/promotions/eligibility";
import { createPromotion, pausePromotion, archivePromotion, schedulePromotion } from "@/lib/db/promotionStore";
import type { CreatePromotionInput, Promotion, PromotionAudience } from "@/lib/promotions/types";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// promotionStore.ts transparently uses its in-memory fallback — real (if
// ephemeral) round-trips, same pattern as the rest of this codebase's
// store tests.

function makeInput(overrides: Partial<CreatePromotionInput> = {}): CreatePromotionInput {
  return {
    name: `Promo ${randomBytes(4).toString("hex")}`,
    text: "🔥 Descuento",
    discountType: "percentage",
    discountValue: 20,
    currency: null,
    startAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // ayer
    endAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // mañana
    audience: "all",
    ctaLabel: "Quiero aprovecharla",
    ...overrides,
  };
}

describe("matchesAudience", () => {
  it("'all' siempre elegible, sin importar el contexto", () => {
    expect(matchesAudience("all", {})).toBe(true);
    expect(matchesAudience("all", { isExistingClient: true })).toBe(true);
    expect(matchesAudience("all", { isExistingClient: false })).toBe(true);
  });

  it("'existing_clients' solo con isExistingClient true — nunca con contexto desconocido", () => {
    expect(matchesAudience("existing_clients", { isExistingClient: true })).toBe(true);
    expect(matchesAudience("existing_clients", { isExistingClient: false })).toBe(false);
    expect(matchesAudience("existing_clients", {})).toBe(false);
  });

  it("'new_users' solo con isExistingClient false — nunca con contexto desconocido", () => {
    expect(matchesAudience("new_users", { isExistingClient: false })).toBe(true);
    expect(matchesAudience("new_users", { isExistingClient: true })).toBe(false);
    expect(matchesAudience("new_users", {})).toBe(false);
  });
});

describe("toPublicPromotion — nunca expone campos administrativos", () => {
  it("omite name, audience, status, metadata, audienceRules", () => {
    const promotion: Promotion = {
      id: "p1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      name: "Nombre interno del admin",
      text: "Texto visible",
      discountType: "percentage",
      discountValue: 20,
      currency: null,
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-01-31T00:00:00.000Z",
      audience: "existing_clients",
      status: "scheduled",
      ctaLabel: "CTA",
      ctaMessage: "Hola, quiero aprovechar esta promoción.",
      metadata: { secret: "internal" },
      audienceRules: null,
    };
    const publicView = toPublicPromotion(promotion);
    const json = JSON.stringify(publicView);
    expect(json).not.toContain("Nombre interno");
    expect(json).not.toContain("existing_clients");
    expect(json).not.toContain("secret");
    expect(publicView).toEqual({
      id: "p1",
      text: "Texto visible",
      discountType: "percentage",
      discountValue: 20,
      currency: null,
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-01-31T00:00:00.000Z",
      ctaLabel: "CTA",
      ctaMessage: "Hola, quiero aprovechar esta promoción.",
    });
  });

  it("ctaMessage null (el caso común en Fase 11B, nada lo escribe todavía) se preserva como null, nunca inventado", () => {
    const promotion: Promotion = {
      id: "p2",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      name: "Nombre",
      text: "Texto",
      discountType: "percentage",
      discountValue: 20,
      currency: null,
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-01-31T00:00:00.000Z",
      audience: "all",
      status: "scheduled",
      ctaLabel: "CTA",
      ctaMessage: null,
      metadata: {},
      audienceRules: null,
    };
    expect(toPublicPromotion(promotion).ctaMessage).toBeNull();
  });
});

async function makeActivePromotion(audience: PromotionAudience): Promise<Promotion> {
  const created = await createPromotion(makeInput({ audience }));
  return schedulePromotion(created.id);
}

describe("getEligibleActivePromotions — solo lo efectivamente activo y elegible", () => {
  it("una promoción programada y en rango de fechas, audiencia 'all', es elegible sin contexto", async () => {
    const promo = await makeActivePromotion("all");
    const results = await getEligibleActivePromotions({});
    expect(results.some((p) => p.id === promo.id)).toBe(true);
  });

  it("promoción ARCHIVADA nunca aparece, sin importar fechas/audiencia", async () => {
    const promo = await makeActivePromotion("all");
    await archivePromotion(promo.id);
    const results = await getEligibleActivePromotions({});
    expect(results.some((p) => p.id === promo.id)).toBe(false);
  });

  it("promoción PAUSADA nunca aparece, sin importar fechas/audiencia", async () => {
    const promo = await makeActivePromotion("all");
    await pausePromotion(promo.id);
    const results = await getEligibleActivePromotions({});
    expect(results.some((p) => p.id === promo.id)).toBe(false);
  });

  it("promoción fuera de rango (start_at en el futuro) nunca aparece", async () => {
    const created = await createPromotion(
      makeInput({
        audience: "all",
        startAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        endAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
      })
    );
    const promo = await schedulePromotion(created.id);
    const results = await getEligibleActivePromotions({});
    expect(results.some((p) => p.id === promo.id)).toBe(false);
  });

  it("promoción fuera de rango (end_at en el pasado) nunca aparece", async () => {
    const created = await createPromotion(
      makeInput({
        audience: "all",
        startAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        endAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      })
    );
    const promo = await schedulePromotion(created.id);
    const results = await getEligibleActivePromotions({});
    expect(results.some((p) => p.id === promo.id)).toBe(false);
  });

  it("respeta la audiencia: 'existing_clients' no aparece para un contexto de usuario nuevo", async () => {
    const promo = await makeActivePromotion("existing_clients");
    const results = await getEligibleActivePromotions({ isExistingClient: false });
    expect(results.some((p) => p.id === promo.id)).toBe(false);
  });

  it("respeta la audiencia: 'new_users' no aparece para un contexto de cliente existente", async () => {
    const promo = await makeActivePromotion("new_users");
    const results = await getEligibleActivePromotions({ isExistingClient: true });
    expect(results.some((p) => p.id === promo.id)).toBe(false);
  });

  it("un borrador (draft) nunca aparece, aunque sus fechas estén en rango", async () => {
    const created = await createPromotion(makeInput({ audience: "all" })); // status: draft, nunca schedulePromotion()
    const results = await getEligibleActivePromotions({});
    expect(results.some((p) => p.id === created.id)).toBe(false);
  });
});
