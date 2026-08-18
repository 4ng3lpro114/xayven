import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createPricingMarket } from "@/lib/db/pricingMarketStore";

const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/markets/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/markets/[id]", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset().mockResolvedValue(true);
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);
    const res = await POST(makeRequest({ name: "x" }), { params: Promise.resolve({ id: "any" }) });
    expect(res.status).toBe(401);
  });

  it("id inexistente → 404", async () => {
    const res = await POST(makeRequest({ name: "x" }), { params: Promise.resolve({ id: "no-existe" }) });
    expect(res.status).toBe(404);
  });

  it("edita nombre y conversionAllowed, nunca el code", async () => {
    const market = await createPricingMarket({
      code: `EDIT-${Date.now()}`,
      name: "Original",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });

    const res = await POST(makeRequest({ name: "Editado", conversionAllowed: true }), {
      params: Promise.resolve({ id: market.id }),
    });
    expect(res.status).toBe(200);

    const { getPricingMarketById } = await import("@/lib/db/pricingMarketStore");
    const updated = await getPricingMarketById(market.id);
    expect(updated?.name).toBe("Editado");
    expect(updated?.conversionAllowed).toBe(true);
    expect(updated?.code).toBe(market.code); // inmutable
  });

  it("body con 'code' → ignorado por el schema (nunca se filtra al store)", async () => {
    const market = await createPricingMarket({
      code: `IGNORE-CODE-${Date.now()}`,
      name: "x",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const res = await POST(makeRequest({ code: "HACKED", name: "y" }), { params: Promise.resolve({ id: market.id }) });
    expect(res.status).toBe(200);
    const { getPricingMarketById } = await import("@/lib/db/pricingMarketStore");
    expect((await getPricingMarketById(market.id))?.code).toBe(market.code);
  });
});
