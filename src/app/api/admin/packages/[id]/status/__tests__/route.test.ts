import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createPricingCatalogItem, getPricingCatalogItemById } from "@/lib/db/pricingCatalogStore";

const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/packages/x/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function makeTestItem(isActive = true) {
  return createPricingCatalogItem({
    slug: `test-status-${Math.random().toString(36).slice(2, 8)}`,
    name: "Producto",
    category: "package",
    billingInterval: "ONE_TIME",
    priceType: "FIXED",
    basePrice: 100_000,
    currency: "COP",
    isActive,
    features: { es: [], en: [] },
  });
}

describe("POST /api/admin/packages/[id]/status", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);
    const item = await makeTestItem();
    const res = await POST(makeRequest({ action: "deactivate" }), { params: Promise.resolve({ id: item.id }) });
    expect(res.status).toBe(401);
  });

  it("action='deactivate' → isActive queda false", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const item = await makeTestItem(true);
    const res = await POST(makeRequest({ action: "deactivate" }), { params: Promise.resolve({ id: item.id }) });
    expect(res.status).toBe(200);
    const reloaded = await getPricingCatalogItemById(item.id);
    expect(reloaded?.isActive).toBe(false);
  });

  it("action='activate' → isActive queda true", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const item = await makeTestItem(false);
    const res = await POST(makeRequest({ action: "activate" }), { params: Promise.resolve({ id: item.id }) });
    expect(res.status).toBe(200);
    const reloaded = await getPricingCatalogItemById(item.id);
    expect(reloaded?.isActive).toBe(true);
  });

  it("id inexistente → 404 not_found", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest({ action: "activate" }), { params: Promise.resolve({ id: "no-existe" }) });
    expect(res.status).toBe(404);
  });

  it("action inválido → 400 validation_failed", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const item = await makeTestItem();
    const res = await POST(makeRequest({ action: "delete" }), { params: Promise.resolve({ id: item.id }) });
    expect(res.status).toBe(400);
  });
});
