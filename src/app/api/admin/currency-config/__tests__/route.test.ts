import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getCurrencyConfig } from "@/lib/db/currencyConfigStore";

const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/currency-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/currency-config", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset().mockResolvedValue(true);
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);
    const res = await POST(makeRequest({ currency: "USD", roundingUnit: 1, decimalPlaces: 2 }));
    expect(res.status).toBe(401);
  });

  it("actualiza la regla de redondeo de USD", async () => {
    const res = await POST(makeRequest({ currency: "USD", roundingUnit: 5, decimalPlaces: 2 }));
    expect(res.status).toBe(200);
    const config = await getCurrencyConfig("USD");
    expect(config?.roundingUnit).toBe(5);
    // Restaurar para no afectar otros tests que dependan del valor sembrado.
    await POST(makeRequest({ currency: "USD", roundingUnit: 1, decimalPlaces: 2 }));
  });

  it("moneda fuera del set cerrado → 400 validation_failed", async () => {
    const res = await POST(makeRequest({ currency: "EUR", roundingUnit: 1, decimalPlaces: 2 }));
    expect(res.status).toBe(400);
  });

  it("roundingUnit <= 0 → 400 validation_failed", async () => {
    const res = await POST(makeRequest({ currency: "COP", roundingUnit: 0, decimalPlaces: 0 }));
    expect(res.status).toBe(400);
  });
});
