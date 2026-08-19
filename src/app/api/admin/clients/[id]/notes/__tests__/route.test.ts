import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/db/paymentsStore";

const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/clients/x/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function makeClient() {
  return createClient({ name: "Diana", email: `${randomUUID()}@example.com`, phone: null });
}

describe("POST /api/admin/clients/[id]/notes", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);
    const res = await POST(makeRequest({ body: "Nota" }), makeContext("does-not-matter"));
    expect(res.status).toBe(401);
  });

  it("cliente inexistente → 404, antes de validar el body", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(
      makeRequest({ body: "Nota" }),
      makeContext("00000000-0000-0000-0000-000000000000")
    );
    expect(res.status).toBe(404);
  });

  it("body vacío → 400 validation_failed", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await makeClient();
    const res = await POST(makeRequest({ body: "" }), makeContext(client.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("validation_failed");
  });

  it("body ausente → 400 validation_failed", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await makeClient();
    const res = await POST(makeRequest({}), makeContext(client.id));
    expect(res.status).toBe(400);
  });

  it("body válido → 200, nota creada con el clientId de la URL", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await makeClient();
    const res = await POST(makeRequest({ body: "Llamó para preguntar por el proyecto." }), makeContext(client.id));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; note: { clientId: string; body: string } };
    expect(json.ok).toBe(true);
    expect(json.note.clientId).toBe(client.id);
    expect(json.note.body).toBe("Llamó para preguntar por el proyecto.");
  });
});
