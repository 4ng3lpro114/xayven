import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createPricingMarket, getMarketCountry } from "@/lib/db/pricingMarketStore";

const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/markets/x/countries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/markets/[id]/countries", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset().mockResolvedValue(true);
  });

  it("agrega y luego quita una ruta país→mercado", async () => {
    const market = await createPricingMarket({
      code: `ROUTE-${Date.now()}`,
      name: "x",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });

    const add = await POST(makeRequest({ action: "add", countryCode: "us" }), { params: Promise.resolve({ id: market.id }) });
    expect(add.status).toBe(200);
    expect((await getMarketCountry("US"))?.marketId).toBe(market.id); // se normaliza a mayúsculas

    const remove = await POST(makeRequest({ action: "remove", countryCode: "US" }), {
      params: Promise.resolve({ id: market.id }),
    });
    expect(remove.status).toBe(200);
    expect(await getMarketCountry("US")).toBeNull();
  });

  it("countryCode con formato inválido → 400", async () => {
    const market = await createPricingMarket({
      code: `ROUTE-BAD-${Date.now()}`,
      name: "x",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const res = await POST(makeRequest({ action: "add", countryCode: "USA" }), { params: Promise.resolve({ id: market.id }) });
    expect(res.status).toBe(400);
  });

  it("mercado id inexistente → 404", async () => {
    const res = await POST(makeRequest({ action: "add", countryCode: "US" }), { params: Promise.resolve({ id: "no-existe" }) });
    expect(res.status).toBe(404);
  });
});
