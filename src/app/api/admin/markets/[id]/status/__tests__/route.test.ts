import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createPricingMarket, getPricingMarketById } from "@/lib/db/pricingMarketStore";

const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/markets/x/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/markets/[id]/status", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset().mockResolvedValue(true);
  });

  it("desactiva y reactiva un mercado, nunca lo borra", async () => {
    const market = await createPricingMarket({
      code: `STATUS-${Date.now()}`,
      name: "x",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });

    const off = await POST(makeRequest({ action: "deactivate" }), { params: Promise.resolve({ id: market.id }) });
    expect(off.status).toBe(200);
    expect((await getPricingMarketById(market.id))?.isActive).toBe(false);

    const on = await POST(makeRequest({ action: "activate" }), { params: Promise.resolve({ id: market.id }) });
    expect(on.status).toBe(200);
    expect((await getPricingMarketById(market.id))?.isActive).toBe(true);
  });

  it("action inválido → 400", async () => {
    const res = await POST(makeRequest({ action: "delete" }), { params: Promise.resolve({ id: "x" }) });
    expect(res.status).toBe(400);
  });

  it("id inexistente → 404", async () => {
    const res = await POST(makeRequest({ action: "activate" }), { params: Promise.resolve({ id: "no-existe" }) });
    expect(res.status).toBe(404);
  });
});
