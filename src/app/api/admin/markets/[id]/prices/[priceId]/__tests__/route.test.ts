import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createPricingMarket, createPricingMarketPrice, getPricingMarketPriceById } from "@/lib/db/pricingMarketStore";
import { getPricingCatalogItemBySlug } from "@/lib/db/pricingCatalogStore";

const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/markets/x/prices/y", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/markets/[id]/prices/[priceId]", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset().mockResolvedValue(true);
  });

  it("edita price/priceType/isActive de un precio existente", async () => {
    const market = await createPricingMarket({
      code: `EDITPRICE-${Date.now()}`,
      name: "x",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const item = await getPricingCatalogItemBySlug("custom");
    const price = await createPricingMarketPrice({
      pricingCatalogId: item!.id,
      marketId: market.id,
      currency: "USD",
      priceType: "FROM",
      price: 5000,
      isActive: true,
    });

    const res = await POST(makeRequest({ price: 6000, isActive: false }), {
      params: Promise.resolve({ id: market.id, priceId: price.id }),
    });
    expect(res.status).toBe(200);

    const updated = await getPricingMarketPriceById(price.id);
    expect(updated?.price).toBe(6000);
    expect(updated?.isActive).toBe(false);
    // Inmutable — nunca cambia por este endpoint.
    expect(updated?.currency).toBe("USD");
    expect(updated?.marketId).toBe(market.id);
  });

  it("priceId que pertenece a OTRO mercado (id en la URL no coincide) → 404", async () => {
    const marketA = await createPricingMarket({
      code: `OWNER-A-${Date.now()}`,
      name: "x",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const marketB = await createPricingMarket({
      code: `OWNER-B-${Date.now()}`,
      name: "y",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const item = await getPricingCatalogItemBySlug("essential");
    const price = await createPricingMarketPrice({
      pricingCatalogId: item!.id,
      marketId: marketA.id,
      currency: "USD",
      priceType: "FIXED",
      price: 15,
      isActive: true,
    });

    const res = await POST(makeRequest({ price: 20 }), {
      params: Promise.resolve({ id: marketB.id, priceId: price.id }),
    });
    expect(res.status).toBe(404);
  });

  it("priceId inexistente → 404", async () => {
    const res = await POST(makeRequest({ price: 1 }), { params: Promise.resolve({ id: "x", priceId: "no-existe" }) });
    expect(res.status).toBe(404);
  });
});
