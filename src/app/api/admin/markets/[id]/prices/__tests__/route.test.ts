import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createPricingMarket } from "@/lib/db/pricingMarketStore";

const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/markets/x/prices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// pricingCatalogId only needs to be UUID-SHAPED to satisfy this route's
// schema (createPricingMarketPriceSchema) — these tests exercise the
// route's request/response contract (auth, validation, mismatch
// detection), not full referential integrity against a real catalog item
// (that's already covered by pricingMarketStore.test.ts /
// officialPricing.test.ts, which use real seeded slugs).

describe("POST /api/admin/markets/[id]/prices", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset().mockResolvedValue(true);
  });

  it("crea el precio oficial de un item para este mercado", async () => {
    const market = await createPricingMarket({
      code: `PRICE-${Date.now()}`,
      name: "x",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });

    const res = await POST(
      makeRequest({
        pricingCatalogId: randomUUID(),
        marketId: market.id,
        currency: "USD",
        priceType: "FIXED",
        price: 399,
        isActive: true,
      }),
      { params: Promise.resolve({ id: market.id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.priceId).toBeTruthy();
  });

  it("marketId del body distinto al de la URL → 400 market_mismatch", async () => {
    const marketA = await createPricingMarket({
      code: `MISMATCH-A-${Date.now()}`,
      name: "x",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });
    const marketB = await createPricingMarket({
      code: `MISMATCH-B-${Date.now()}`,
      name: "y",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });

    const res = await POST(
      makeRequest({
        pricingCatalogId: randomUUID(),
        marketId: marketB.id, // distinto del id en la URL
        currency: "USD",
        priceType: "FIXED",
        price: 999,
        isActive: true,
      }),
      { params: Promise.resolve({ id: marketA.id }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("market_mismatch");
  });

  it("currency del body distinta a la del mercado → 400 currency_mismatch", async () => {
    const market = await createPricingMarket({
      code: `CURMISMATCH-${Date.now()}`,
      name: "x",
      currency: "USD",
      conversionAllowed: false,
      fallbackBehavior: "QUOTE_ONLY",
      isActive: true,
    });

    const res = await POST(
      makeRequest({
        pricingCatalogId: randomUUID(),
        marketId: market.id,
        currency: "COP", // el mercado es USD
        priceType: "FIXED",
        price: 799_000,
        isActive: true,
      }),
      { params: Promise.resolve({ id: market.id }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("currency_mismatch");
  });
});
