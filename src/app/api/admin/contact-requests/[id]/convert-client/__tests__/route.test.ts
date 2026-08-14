import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createContactRequest } from "@/lib/db/contactRequestStore";
import { deleteClient } from "@/lib/db/paymentsStore";

const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/admin/contact-requests/x/convert-client", {
    method: "POST",
  });
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function makeContactRequest(overrides: Partial<Parameters<typeof createContactRequest>[0]> = {}) {
  return createContactRequest({
    name: "Diana",
    email: `${randomUUID()}@example.com`,
    company: "Aguacates",
    projectType: "Sitio web nuevo",
    budget: "Menos de $1.000.000 COP",
    message: "Necesito ayuda con mi proyecto.",
    ...overrides,
  });
}

describe("POST /api/admin/contact-requests/[id]/convert-client", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);
    const res = await POST(makeRequest(), makeContext("does-not-matter"));
    expect(res.status).toBe(401);
  });

  it("id inexistente → 404 not_found", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest(), makeContext("00000000-0000-0000-0000-000000000000"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });

  it("éxito: crea el cliente, lo devuelve, y 'Ver cliente' (client.id) apunta al cliente correcto", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const request = await makeContactRequest();

    const res = await POST(makeRequest(), makeContext(request.id));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.created).toBe(true);
    expect(body.client.id).toBeTruthy();
    expect(body.client.name).toBe(request.name);
    expect(body.client.email).toBe(request.email);
  });

  it("segunda llamada sobre la misma solicitud → idempotente, mismo client.id, created:false", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const request = await makeContactRequest();

    const first = await POST(makeRequest(), makeContext(request.id));
    const firstBody = await first.json();

    const second = await POST(makeRequest(), makeContext(request.id));
    const secondBody = await second.json();

    expect(second.status).toBe(200);
    expect(secondBody.client.id).toBe(firstBody.client.id);
    expect(secondBody.created).toBe(false);
  });

  it("cliente vinculado eliminado → un nuevo POST recupera la solicitud (200, crea/reutiliza), nunca 409", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const request = await makeContactRequest();
    const first = await POST(makeRequest(), makeContext(request.id));
    const clientId = (await first.json()).client.id;

    await deleteClient(clientId);

    // deleteClient() nulls contact_requests.client_id (parity with real
    // Supabase's ON DELETE SET NULL — see
    // nullifyClientIdInContactRequestsMemory()), so this re-enters the
    // "no clientId yet" branch and recovers by creating a new client,
    // rather than hitting the client_not_found error path.
    const res = await POST(makeRequest(), makeContext(request.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.created).toBe(true);
    expect(body.client.id).not.toBe(clientId);
  });
});
