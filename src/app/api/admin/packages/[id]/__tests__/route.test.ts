import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createPricingCatalogItem, getPricingCatalogItemById } from "@/lib/db/pricingCatalogStore";

const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/packages/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function makeTestItem() {
  return createPricingCatalogItem({
    slug: `test-edit-${Math.random().toString(36).slice(2, 8)}`,
    name: "Original",
    category: "package",
    billingInterval: "ONE_TIME",
    priceType: "FIXED",
    basePrice: 100_000,
    currency: "COP",
    isActive: true,
    features: { es: [], en: [] },
  });
}

describe("POST /api/admin/packages/[id]", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);
    const item = await makeTestItem();
    const res = await POST(makeRequest({ name: "Nuevo nombre" }), { params: Promise.resolve({ id: item.id }) });
    expect(res.status).toBe(401);
  });

  it("id inexistente → 404 not_found", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest({ name: "x" }), { params: Promise.resolve({ id: "no-existe" }) });
    expect(res.status).toBe(404);
  });

  it("edita name/basePrice — nunca toca slug/category/billingInterval aunque se envíen", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const item = await makeTestItem();

    const res = await POST(
      makeRequest({ name: "Nuevo nombre", basePrice: 999_000, slug: "hackeado", category: "maintenance" }),
      { params: Promise.resolve({ id: item.id }) }
    );
    expect(res.status).toBe(200);

    const reloaded = await getPricingCatalogItemById(item.id);
    expect(reloaded?.name).toBe("Nuevo nombre");
    expect(reloaded?.basePrice).toBe(999_000);
    expect(reloaded?.slug).toBe(item.slug); // unchanged, schema strips it
    expect(reloaded?.category).toBe("package"); // unchanged
  });

  it("basePrice <= 0 → 400 validation_failed", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const item = await makeTestItem();
    const res = await POST(makeRequest({ basePrice: 0 }), { params: Promise.resolve({ id: item.id }) });
    expect(res.status).toBe(400);
  });
});
