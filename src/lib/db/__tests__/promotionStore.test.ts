import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import {
  createPromotion,
  getPromotionById,
  listPromotions,
  updatePromotion,
  schedulePromotion,
  pausePromotion,
  resumePromotion,
  archivePromotion,
  PromotionNotFoundError,
  PromotionArchivedError,
  PromotionTransitionError,
} from "@/lib/db/promotionStore";
import type { CreatePromotionInput } from "@/lib/promotions/types";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// promotionStore.ts transparently uses its in-memory fallback — real (if
// ephemeral) round-trips, same pattern as conversationStore.test.ts.

function makeInput(overrides: Partial<CreatePromotionInput> = {}): CreatePromotionInput {
  return {
    name: `Promo ${randomBytes(4).toString("hex")}`,
    text: "🔥 Descuento",
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

describe("createPromotion", () => {
  it("crea una promoción y siempre empieza en 'draft', sin importar lo que implique el input", async () => {
    const promotion = await createPromotion(makeInput());
    expect(promotion.status).toBe("draft");
    expect(promotion.id).toBeTruthy();
    expect(promotion.createdAt).toBeTruthy();
    expect(promotion.updatedAt).toBeTruthy();
  });

  it("metadata y audienceRules quedan reservados (vacíos), nunca inventados desde el input", async () => {
    const promotion = await createPromotion(makeInput());
    expect(promotion.metadata).toEqual({});
    expect(promotion.audienceRules).toBeNull();
  });

  it("ctaMessage: sin especificarlo en el input → null, nunca inventado", async () => {
    const promotion = await createPromotion(makeInput());
    expect(promotion.ctaMessage).toBeNull();
  });

  it("ctaMessage: se guarda tal cual cuando se especifica", async () => {
    const promotion = await createPromotion(
      makeInput({ ctaMessage: "Hola, quiero aprovechar la promoción de agosto del 20%." })
    );
    expect(promotion.ctaMessage).toBe("Hola, quiero aprovechar la promoción de agosto del 20%.");
  });
});

describe("getPromotionById", () => {
  it("obtiene una promoción recién creada", async () => {
    const created = await createPromotion(makeInput({ name: "Buscable" }));
    const found = await getPromotionById(created.id);
    expect(found?.name).toBe("Buscable");
  });

  it("id inexistente → null, nunca lanza", async () => {
    const found = await getPromotionById("00000000-0000-0000-0000-000000000000");
    expect(found).toBeNull();
  });
});

describe("listPromotions", () => {
  it("lista promociones, filtrando por status cuando se pide", async () => {
    const a = await createPromotion(makeInput({ name: "A" }));
    await schedulePromotion(a.id);
    await createPromotion(makeInput({ name: "B" })); // se queda en draft

    const scheduled = await listPromotions({ status: "scheduled" });
    expect(scheduled.some((p) => p.id === a.id)).toBe(true);
    expect(scheduled.every((p) => p.status === "scheduled")).toBe(true);
  });
});

describe("updatePromotion", () => {
  it("edita campos y actualiza updatedAt", async () => {
    const created = await createPromotion(makeInput({ name: "Original" }));
    const updated = await updatePromotion(created.id, { name: "Editado" });
    expect(updated.name).toBe("Editado");
  });

  it("id inexistente → PromotionNotFoundError", async () => {
    await expect(updatePromotion("00000000-0000-0000-0000-000000000000", { name: "X" })).rejects.toBeInstanceOf(
      PromotionNotFoundError
    );
  });

  it("ctaMessage se puede establecer después de crear la promoción sin uno", async () => {
    const created = await createPromotion(makeInput());
    expect(created.ctaMessage).toBeNull();

    const updated = await updatePromotion(created.id, { ctaMessage: "Hola, ¿me cuentas de la promo?" });
    expect(updated.ctaMessage).toBe("Hola, ¿me cuentas de la promo?");
  });

  it("ctaMessage se puede volver a limpiar a null explícitamente", async () => {
    const created = await createPromotion(makeInput({ ctaMessage: "Mensaje inicial" }));
    const updated = await updatePromotion(created.id, { ctaMessage: null });
    expect(updated.ctaMessage).toBeNull();
  });

  it("editar otro campo sin tocar ctaMessage lo deja intacto", async () => {
    const created = await createPromotion(makeInput({ ctaMessage: "No debe cambiar" }));
    const updated = await updatePromotion(created.id, { name: "Otro nombre" });
    expect(updated.ctaMessage).toBe("No debe cambiar");
  });

  it("una promoción ARCHIVADA es de solo lectura — updatePromotion rechaza con PromotionArchivedError", async () => {
    const created = await createPromotion(makeInput());
    await schedulePromotion(created.id);
    await archivePromotion(created.id);

    await expect(updatePromotion(created.id, { name: "Intento de editar" })).rejects.toBeInstanceOf(
      PromotionArchivedError
    );
  });

  it("status nunca cambia a través de updatePromotion (no forma parte de UpdatePromotionInput)", async () => {
    const created = await createPromotion(makeInput());
    // @ts-expect-error — status deliberadamente no existe en UpdatePromotionInput
    const updated = await updatePromotion(created.id, { status: "scheduled", name: "x" });
    expect(updated.status).toBe("draft"); // sin cambios — el campo extra se ignora
  });
});

describe("transiciones de estado — schedule / pause / resume / archive", () => {
  it("schedulePromotion: draft → scheduled", async () => {
    const created = await createPromotion(makeInput());
    const scheduled = await schedulePromotion(created.id);
    expect(scheduled.status).toBe("scheduled");
  });

  it("schedulePromotion desde cualquier estado que no sea draft → PromotionTransitionError", async () => {
    const created = await createPromotion(makeInput());
    await schedulePromotion(created.id);
    await expect(schedulePromotion(created.id)).rejects.toBeInstanceOf(PromotionTransitionError);
  });

  it("pausePromotion: scheduled → paused", async () => {
    const created = await createPromotion(makeInput());
    await schedulePromotion(created.id);
    const paused = await pausePromotion(created.id);
    expect(paused.status).toBe("paused");
  });

  it("pausePromotion desde 'draft' → PromotionTransitionError (solo scheduled se puede pausar)", async () => {
    const created = await createPromotion(makeInput());
    await expect(pausePromotion(created.id)).rejects.toBeInstanceOf(PromotionTransitionError);
  });

  it("resumePromotion: paused → scheduled", async () => {
    const created = await createPromotion(makeInput());
    await schedulePromotion(created.id);
    await pausePromotion(created.id);
    const resumed = await resumePromotion(created.id);
    expect(resumed.status).toBe("scheduled");
  });

  it("resumePromotion desde un estado que no sea 'paused' → PromotionTransitionError", async () => {
    const created = await createPromotion(makeInput());
    await expect(resumePromotion(created.id)).rejects.toBeInstanceOf(PromotionTransitionError);
  });

  it("archivePromotion: legal desde draft, scheduled y paused", async () => {
    const fromDraft = await createPromotion(makeInput());
    expect((await archivePromotion(fromDraft.id)).status).toBe("archived");

    const fromScheduled = await createPromotion(makeInput());
    await schedulePromotion(fromScheduled.id);
    expect((await archivePromotion(fromScheduled.id)).status).toBe("archived");

    const fromPaused = await createPromotion(makeInput());
    await schedulePromotion(fromPaused.id);
    await pausePromotion(fromPaused.id);
    expect((await archivePromotion(fromPaused.id)).status).toBe("archived");
  });

  it("archivar una promoción YA archivada → PromotionTransitionError (idempotencia explícita, nunca un no-op silencioso)", async () => {
    const created = await createPromotion(makeInput());
    await archivePromotion(created.id);
    await expect(archivePromotion(created.id)).rejects.toBeInstanceOf(PromotionTransitionError);
  });

  it("cualquier transición sobre un id inexistente → PromotionNotFoundError", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    await expect(pausePromotion(fakeId)).rejects.toBeInstanceOf(PromotionNotFoundError);
    await expect(resumePromotion(fakeId)).rejects.toBeInstanceOf(PromotionNotFoundError);
    await expect(archivePromotion(fakeId)).rejects.toBeInstanceOf(PromotionNotFoundError);
    await expect(schedulePromotion(fakeId)).rejects.toBeInstanceOf(PromotionNotFoundError);
  });
});
