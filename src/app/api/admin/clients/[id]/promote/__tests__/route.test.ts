import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createClient as createPaymentsClient, getClientById } from "@/lib/db/paymentsStore";

/**
 * requireAdminSession() reads cookies() from next/headers — mocked here
 * the same way as DELETE /api/admin/clients/[id]/__tests__/route.test.ts.
 * Everything else is a real round-trip against the in-memory store.
 */
const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/admin/clients/x/promote", { method: "POST" });
}
function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/admin/clients/[id]/promote — 'Agregar cliente'", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401, nunca promueve", async () => {
    requireAdminSessionMock.mockResolvedValue(false);

    const res = await POST(makeRequest(), makeContext("does-not-matter"));

    expect(res.status).toBe(401);
    expect((await res.json()).ok).toBe(false);
  });

  it("client inexistente → 404", async () => {
    requireAdminSessionMock.mockResolvedValue(true);

    const res = await POST(makeRequest(), makeContext("00000000-0000-0000-0000-000000000000"));

    expect(res.status).toBe(404);
  });

  it("client con isCommercial=false → 200 y queda isCommercial=true en la base", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await createPaymentsClient({
      name: "Cuenta sin cliente",
      email: `t-${Date.now()}-${Math.random()}@example.com`,
      isCommercial: false,
    });

    const res = await POST(makeRequest(), makeContext(client.id));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    const reloaded = await getClientById(client.id);
    expect(reloaded?.isCommercial).toBe(true);
  });

  it("client YA comercial → idempotente, sigue 200/true, no falla", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await createPaymentsClient({
      name: "Cliente real",
      email: `t-${Date.now()}-${Math.random()}@example.com`,
    });
    expect(client.isCommercial).toBe(true);

    const res = await POST(makeRequest(), makeContext(client.id));

    expect(res.status).toBe(200);
    const reloaded = await getClientById(client.id);
    expect(reloaded?.isCommercial).toBe(true);
  });
});
