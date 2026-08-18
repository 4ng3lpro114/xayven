import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getPricingCatalogItemById } from "@/lib/db/pricingCatalogStore";

const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/packages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    slug: `test-package-${Math.random().toString(36).slice(2, 8)}`,
    name: "Producto de prueba",
    category: "package",
    billingInterval: "ONE_TIME",
    priceType: "FIXED",
    basePrice: 500_000,
    currency: "COP",
    isActive: true,
    features: { es: [], en: [] },
    ...overrides,
  };
}

describe("POST /api/admin/packages", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(401);
  });

  it("body válido → 200, crea el producto", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.itemId).toBeTruthy();

    const created = await getPricingCatalogItemById(body.itemId);
    expect(created?.name).toBe("Producto de prueba");
    expect(created?.isActive).toBe(true);
  });

  it("slug duplicado (uno de los 8 seed) → 409 slug_conflict", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest(validBody({ slug: "start" })));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("slug_conflict");
  });

  it("slug con mayúsculas → 400 validation_failed", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest(validBody({ slug: "Not Valid" })));
    expect(res.status).toBe(400);
  });

  it("basePrice <= 0 → 400 validation_failed", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest(validBody({ basePrice: 0 })));
    expect(res.status).toBe(400);
  });

  it("category fuera de 'package'/'maintenance' → 400 validation_failed", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest(validBody({ category: "addon" })));
    expect(res.status).toBe(400);
  });

  it("solo exporta POST — GET/PUT/DELETE/PATCH quedan rechazados automáticamente (405)", async () => {
    const routeModule = await import("../route");
    expect("GET" in routeModule).toBe(false);
    expect("PUT" in routeModule).toBe(false);
    expect("DELETE" in routeModule).toBe(false);
    expect("PATCH" in routeModule).toBe(false);
  });
});
