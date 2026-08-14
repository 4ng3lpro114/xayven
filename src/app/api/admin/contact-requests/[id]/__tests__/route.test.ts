import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import {
  createContactRequest,
  getContactRequestById,
  listContactRequests,
  linkContactRequestToClient,
} from "@/lib/db/contactRequestStore";
import { createClient as createPaymentsClient, createProject, getClientById, listProjects } from "@/lib/db/paymentsStore";

/**
 * requireAdminSession() reads cookies() from next/headers — mocked here
 * regardless of outcome, same pattern as every other admin route test in
 * this project (see conversations/[id]/__tests__/route.test.ts).
 */
const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { DELETE } from "../route";
import * as routeModule from "../route";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/admin/contact-requests/x", { method: "DELETE" });
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeInput(overrides: Partial<Parameters<typeof createContactRequest>[0]> = {}) {
  return {
    name: "Diana",
    email: `${randomUUID()}@example.com`,
    company: "Aguacates",
    projectType: "Sitio web nuevo",
    budget: "Menos de $1.000.000 COP",
    message: "Necesito ayuda con mi proyecto.",
    ...overrides,
  };
}

describe("DELETE /api/admin/contact-requests/[id]", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401, no se borra nada", async () => {
    requireAdminSessionMock.mockResolvedValue(false);
    const created = await createContactRequest(makeInput());

    const res = await DELETE(makeRequest(), makeContext(created.id));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(await getContactRequestById(created.id)).not.toBeNull();
  });

  it("solicitud inexistente → 404", async () => {
    requireAdminSessionMock.mockResolvedValue(true);

    const res = await DELETE(makeRequest(), makeContext("00000000-0000-0000-0000-000000000000"));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("admin autenticado puede eliminar una solicitud existente → 200, ok:true", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const created = await createContactRequest(makeInput());

    const res = await DELETE(makeRequest(), makeContext(created.id));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("después de eliminarla, ya no existe ni aparece en el listado", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const created = await createContactRequest(makeInput());

    await DELETE(makeRequest(), makeContext(created.id));

    expect(await getContactRequestById(created.id)).toBeNull();
    const all = await listContactRequests({ limit: 1000 });
    expect(all.some((r) => r.id === created.id)).toBe(false);
  });

  it("solicitud convertida (status='converted', client_id, client_was_created=true) → el DELETE elimina únicamente contact_requests; el cliente, su proyecto y sus datos permanecen intactos", async () => {
    requireAdminSessionMock.mockResolvedValue(true);

    const client = await createPaymentsClient({
      name: "Diana Cliente",
      email: `diana-${randomUUID()}@example.com`,
      company: "Aguacates",
    });
    const project = await createProject({ clientId: client.id, name: "Sitio web", totalAmount: 1_000_000 });

    const created = await createContactRequest(makeInput());
    await linkContactRequestToClient(created.id, client.id, true);
    const converted = await getContactRequestById(created.id);
    expect(converted?.status).toBe("converted");
    expect(converted?.clientId).toBe(client.id);
    expect(converted?.clientWasCreated).toBe(true);

    const res = await DELETE(makeRequest(), makeContext(created.id));

    expect(res.status).toBe(200);
    expect(await getContactRequestById(created.id)).toBeNull();

    // El cliente y su proyecto sobreviven exactamente igual — la
    // eliminación de la solicitud nunca toca `clients`/`projects`.
    const survivingClient = await getClientById(client.id);
    expect(survivingClient).not.toBeNull();
    expect(survivingClient?.name).toBe("Diana Cliente");
    expect(survivingClient?.updatedAt).toBe(client.updatedAt);

    const survivingProjects = await listProjects({ clientId: client.id });
    expect(survivingProjects).toHaveLength(1);
    expect(survivingProjects[0]!.id).toBe(project.id);
  });

  it("solo exporta DELETE — Next.js rechaza GET/POST/PUT/PATCH automáticamente (405)", () => {
    expect("GET" in routeModule).toBe(false);
    expect("POST" in routeModule).toBe(false);
    expect("PUT" in routeModule).toBe(false);
    expect("PATCH" in routeModule).toBe(false);
  });
});
