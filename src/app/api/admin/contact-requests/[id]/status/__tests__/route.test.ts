import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createContactRequest } from "@/lib/db/contactRequestStore";
import { randomUUID } from "node:crypto";

const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(status: string): NextRequest {
  return new NextRequest("http://localhost/api/admin/contact-requests/x/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function makeContactRequest() {
  return createContactRequest({
    name: "Diana",
    email: `${randomUUID()}@example.com`,
    company: null,
    projectType: "Sitio web nuevo",
    budget: "Menos de $1.000.000 COP",
    message: "Necesito ayuda con mi proyecto.",
  });
}

describe("POST /api/admin/contact-requests/[id]/status", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);
    const res = await POST(makeRequest("contacted"), makeContext("does-not-matter"));
    expect(res.status).toBe(401);
  });

  it("status fuera del enum → 400 validation_failed", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const created = await makeContactRequest();
    const res = await POST(makeRequest("archived"), makeContext(created.id));
    expect(res.status).toBe(400);
  });

  it("id inexistente → 404", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(
      makeRequest("contacted"),
      makeContext("00000000-0000-0000-0000-000000000000")
    );
    expect(res.status).toBe(404);
  });

  it("G. new → contacted → new, ciclo completo vía la ruta", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const created = await makeContactRequest();
    expect(created.status).toBe("new");

    const contactedRes = await POST(makeRequest("contacted"), makeContext(created.id));
    expect(contactedRes.status).toBe(200);
    expect((await contactedRes.json()).status).toBe("contacted");

    const backRes = await POST(makeRequest("new"), makeContext(created.id));
    expect(backRes.status).toBe(200);
    expect((await backRes.json()).status).toBe("new");
  });

  it("'converted' está deliberadamente fuera del enum — 400, nunca alcanzable manualmente", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const created = await makeContactRequest();
    const res = await POST(makeRequest("converted"), makeContext(created.id));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("validation_failed");
  });
});
