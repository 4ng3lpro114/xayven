import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createPromotion, schedulePromotion, archivePromotion } from "@/lib/db/promotionStore";
import type { CreatePromotionInput } from "@/lib/promotions/types";

const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/promotions/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeInput(overrides: Partial<CreatePromotionInput> = {}): CreatePromotionInput {
  return {
    name: "Original",
    text: "Texto original",
    discountType: "percentage",
    discountValue: 20,
    currency: null,
    startAt: "2026-08-15T00:00:00.000Z",
    endAt: "2026-08-31T00:00:00.000Z",
    audience: "all",
    ctaLabel: "CTA original",
    ...overrides,
  };
}

describe("POST /api/admin/promotions/[id]", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);
    const res = await POST(makeRequest({ name: "x" }), makeContext("does-not-matter"));
    expect(res.status).toBe(401);
  });

  it("id inexistente → 404", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(
      makeRequest({ name: "x" }),
      makeContext("00000000-0000-0000-0000-000000000000")
    );
    expect(res.status).toBe(404);
  });

  it("edición parcial válida (solo el nombre) → 200, no exige los demás campos", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const created = await createPromotion(makeInput());

    const res = await POST(makeRequest({ name: "Editado" }), makeContext(created.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("editar solo `text` nunca dispara las reglas cruzadas de descuento/fechas (usa el estado final ya mezclado)", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const created = await createPromotion(makeInput());
    const res = await POST(makeRequest({ text: "Nuevo texto" }), makeContext(created.id));
    expect(res.status).toBe(200);
  });

  it("cambiar discountType a fixed_amount sin mandar currency → 400 (la forma final quedaría inconsistente)", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const created = await createPromotion(makeInput()); // percentage, currency null
    const res = await POST(makeRequest({ discountType: "fixed_amount" }), makeContext(created.id));
    expect(res.status).toBe(400);
  });

  it("promoción archivada → 409 archived_read_only, nunca se edita", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const created = await createPromotion(makeInput());
    await schedulePromotion(created.id);
    await archivePromotion(created.id);

    const res = await POST(makeRequest({ name: "Intento" }), makeContext(created.id));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("archived_read_only");
  });
});
