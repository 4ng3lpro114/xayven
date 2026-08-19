import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/db/paymentsStore";
import { createClientNote, listClientNotes } from "@/lib/db/clientNoteStore";

const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { DELETE } from "../route";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/admin/clients/x/notes/y", { method: "DELETE" });
}

function makeContext(id: string, noteId: string) {
  return { params: Promise.resolve({ id, noteId }) };
}

async function makeClient() {
  return createClient({ name: "Diana", email: `${randomUUID()}@example.com`, phone: null });
}

describe("DELETE /api/admin/clients/[id]/notes/[noteId]", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);
    const res = await DELETE(makeRequest(), makeContext("does-not-matter", "does-not-matter"));
    expect(res.status).toBe(401);
  });

  it("noteId inexistente → 404", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await makeClient();
    const res = await DELETE(makeRequest(), makeContext(client.id, randomUUID()));
    expect(res.status).toBe(404);
  });

  it("nota real de OTRO cliente → 404, nunca se borra (aislamiento por clientId)", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const owner = await makeClient();
    const attacker = await makeClient();
    const note = await createClientNote({ clientId: owner.id, body: "Nota ajena" });

    const res = await DELETE(makeRequest(), makeContext(attacker.id, note.id));
    expect(res.status).toBe(404);

    const stillThere = await listClientNotes(owner.id);
    expect(stillThere.map((n) => n.id)).toContain(note.id);
  });

  it("nota real del cliente correcto → 200, queda eliminada", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await makeClient();
    const note = await createClientNote({ clientId: client.id, body: "Para borrar" });

    const res = await DELETE(makeRequest(), makeContext(client.id, note.id));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const remaining = await listClientNotes(client.id);
    expect(remaining.map((n) => n.id)).not.toContain(note.id);
  });
});
