import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getPromotionById } from "@/lib/db/promotionStore";

/**
 * requireAdminSession() reads cookies() from next/headers, which needs
 * Next's per-request AsyncLocalStorage — unavailable when a route handler
 * is invoked directly outside a real Next.js request lifecycle, so it's
 * mocked here regardless of which auth outcome a given test wants.
 * Everything else runs for real against the in-memory fallback.
 */
const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/promotions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
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

describe("POST /api/admin/promotions", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(401);
  });

  it("body válido → 200, crea la promoción como 'draft'", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.promotionId).toBeTruthy();

    const created = await getPromotionById(body.promotionId);
    expect(created?.status).toBe("draft");
    expect(created?.name).toBe("Promoción de agosto");
  });

  it("ctaMessage se guarda cuando se envía, y queda null cuando se omite", async () => {
    requireAdminSessionMock.mockResolvedValue(true);

    const withMessage = await POST(
      makeRequest(validBody({ ctaMessage: "Hola, quiero aprovechar la promoción de agosto del 20%." }))
    );
    const withMessageBody = await withMessage.json();
    const createdWithMessage = await getPromotionById(withMessageBody.promotionId);
    expect(createdWithMessage?.ctaMessage).toBe("Hola, quiero aprovechar la promoción de agosto del 20%.");

    const withoutMessage = await POST(makeRequest(validBody()));
    const withoutMessageBody = await withoutMessage.json();
    const createdWithoutMessage = await getPromotionById(withoutMessageBody.promotionId);
    expect(createdWithoutMessage?.ctaMessage).toBeNull();
  });

  it("ctaMessage demasiado largo (>300) → 400 validation_failed", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest(validBody({ ctaMessage: "x".repeat(301) })));
    expect(res.status).toBe(400);
  });

  it("nombre vacío → 400 validation_failed", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest(validBody({ name: "" })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
  });

  it("porcentaje > 100 → 400 validation_failed con el campo señalado", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest(validBody({ discountValue: 150 })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.fields?.discountValue).toBeDefined();
  });

  it("descuento <= 0 → 400 (rechazado por el schema de zod, antes de las reglas cruzadas)", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest(validBody({ discountValue: 0 })));
    expect(res.status).toBe(400);
  });

  it("end_at antes de start_at → 400 validation_failed", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(
      makeRequest(validBody({ startAt: "2026-08-31T00:00:00.000Z", endAt: "2026-08-15T00:00:00.000Z" }))
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fields?.endAt).toBeDefined();
  });

  it("fixed_amount sin moneda → 400 validation_failed", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(
      makeRequest(validBody({ discountType: "fixed_amount", discountValue: 100000, currency: null }))
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fields?.currency).toBeDefined();
  });

  it("solo exporta POST — GET/PUT/DELETE/PATCH quedan rechazados automáticamente (405)", async () => {
    const routeModule = await import("../route");
    expect("GET" in routeModule).toBe(false);
    expect("PUT" in routeModule).toBe(false);
    expect("DELETE" in routeModule).toBe(false);
    expect("PATCH" in routeModule).toBe(false);
  });
});
