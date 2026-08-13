import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createPromotion, schedulePromotion, pausePromotion } from "@/lib/db/promotionStore";
import type { CreatePromotionInput } from "@/lib/promotions/types";

const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(action: string): NextRequest {
  return new NextRequest("http://localhost/api/admin/promotions/x/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeInput(overrides: Partial<CreatePromotionInput> = {}): CreatePromotionInput {
  return {
    name: "Promo",
    text: "Texto",
    discountType: "percentage",
    discountValue: 20,
    currency: null,
    startAt: "2026-08-15T00:00:00.000Z",
    endAt: "2026-08-31T00:00:00.000Z",
    audience: "all",
    ctaLabel: "CTA",
    ...overrides,
  };
}

describe("POST /api/admin/promotions/[id]/status", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);
    const res = await POST(makeRequest("pause"), makeContext("does-not-matter"));
    expect(res.status).toBe(401);
  });

  it("action fuera del enum → 400 validation_failed", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const created = await createPromotion(makeInput());
    const res = await POST(makeRequest("delete"), makeContext(created.id));
    expect(res.status).toBe(400);
  });

  it("id inexistente → 404", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest("pause"), makeContext("00000000-0000-0000-0000-000000000000"));
    expect(res.status).toBe(404);
  });

  it("schedule: draft → scheduled, 200", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const created = await createPromotion(makeInput());
    const res = await POST(makeRequest("schedule"), makeContext(created.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("scheduled");
  });

  it("pause sobre un 'draft' → 409 illegal_transition", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const created = await createPromotion(makeInput());
    const res = await POST(makeRequest("pause"), makeContext(created.id));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("illegal_transition");
  });

  it("pause → resume, ciclo completo vía la ruta", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const created = await createPromotion(makeInput());
    await schedulePromotion(created.id);

    const pauseRes = await POST(makeRequest("pause"), makeContext(created.id));
    expect(pauseRes.status).toBe(200);
    expect((await pauseRes.json()).status).toBe("paused");

    const resumeRes = await POST(makeRequest("resume"), makeContext(created.id));
    expect(resumeRes.status).toBe(200);
    expect((await resumeRes.json()).status).toBe("scheduled");
  });

  it("archive es válido incluso desde 'paused'", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const created = await createPromotion(makeInput());
    await schedulePromotion(created.id);
    await pausePromotion(created.id);

    const res = await POST(makeRequest("archive"), makeContext(created.id));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("archived");
  });

  it("archivar dos veces → la segunda vez 409 illegal_transition", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const created = await createPromotion(makeInput());
    await POST(makeRequest("archive"), makeContext(created.id));
    const secondRes = await POST(makeRequest("archive"), makeContext(created.id));
    expect(secondRes.status).toBe(409);
  });
});
