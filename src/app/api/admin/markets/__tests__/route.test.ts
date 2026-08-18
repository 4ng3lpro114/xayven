import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getPricingMarketById } from "@/lib/db/pricingMarketStore";

const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/markets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    code: `TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    name: "Test market",
    currency: "USD",
    conversionAllowed: false,
    fallbackBehavior: "QUOTE_ONLY",
    isActive: true,
    ...overrides,
  };
}

describe("POST /api/admin/markets", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(401);
  });

  it("body válido → 200, crea el mercado", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.marketId).toBeTruthy();

    const created = await getPricingMarketById(body.marketId);
    expect(created?.name).toBe("Test market");
    expect(created?.conversionAllowed).toBe(false);
  });

  it("code duplicado ('OTHER', el mercado sembrado) → 409 code_conflict", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest(validBody({ code: "OTHER" })));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("code_conflict");
  });

  it("currency fuera del set cerrado → 400 validation_failed", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest(validBody({ currency: "EUR" })));
    expect(res.status).toBe(400);
  });

  it("fallbackBehavior inválido → 400 validation_failed", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest(validBody({ fallbackBehavior: "INVENT_A_PRICE" })));
    expect(res.status).toBe(400);
  });

  it("solo exporta POST", async () => {
    const routeModule = await import("../route");
    expect("GET" in routeModule).toBe(false);
    expect("PUT" in routeModule).toBe(false);
    expect("DELETE" in routeModule).toBe(false);
  });
});
