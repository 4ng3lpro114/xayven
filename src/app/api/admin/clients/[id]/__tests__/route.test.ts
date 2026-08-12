import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createClient as createPaymentsClient,
  createProject,
  createPayment,
  setProjectPaidAmount,
  getClientById,
} from "@/lib/db/paymentsStore";

/**
 * requireAdminSession() reads cookies() from next/headers, which needs
 * Next's per-request AsyncLocalStorage — unavailable when a route handler
 * is invoked directly outside a real Next.js request lifecycle, so it's
 * mocked here regardless of which auth outcome a given test wants.
 * Everything else is a real round-trip against the in-memory store — same
 * pattern as api/admin/conversations/[id]/__tests__/route.test.ts.
 */
const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { DELETE } from "../route";
import * as routeModule from "../route";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/admin/clients/x", { method: "DELETE" });
}
function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function makeClient() {
  return createPaymentsClient({
    name: "Cliente de prueba",
    email: `t-${Date.now()}-${Math.random()}@example.com`,
  });
}

describe("DELETE /api/admin/clients/[id]", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);

    const res = await DELETE(makeRequest(), makeContext("does-not-matter"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("cliente inexistente → 404", async () => {
    requireAdminSessionMock.mockResolvedValue(true);

    const res = await DELETE(
      makeRequest(),
      makeContext("00000000-0000-0000-0000-000000000000")
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("cliente sin proyectos/pagos (normal) → 200, y realmente desaparece", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await makeClient();

    const res = await DELETE(makeRequest(), makeContext(client.id));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(await getClientById(client.id)).toBeNull();
  });

  it("cliente con un pago registrado (fila real en `payments`) → 409 has_payments, NO se borra", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await makeClient();
    const project = await createProject({ clientId: client.id, name: "Proyecto", totalAmount: 1000 });
    await createPayment({
      projectId: project.id,
      clientId: client.id,
      provider: "WOMPI",
      reference: `REF-${Date.now()}`,
      amount: 500,
      currency: "COP",
      paymentType: "DEPOSIT",
    });

    const res = await DELETE(makeRequest(), makeContext(client.id));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("has_payments");
    expect(await getClientById(client.id)).not.toBeNull();
  });

  it("cliente con proyecto de paid_amount > 0 pero SIN fila en `payments` → 409 has_payments igual (paidAmount cuenta como pago)", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await makeClient();
    const project = await createProject({ clientId: client.id, name: "Proyecto pagado", totalAmount: 1000 });
    await setProjectPaidAmount(project.id, 500, "active");

    const res = await DELETE(makeRequest(), makeContext(client.id));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("has_payments");
    expect(await getClientById(client.id)).not.toBeNull();
  });

  it("cliente con un proyecto comercialmente activo (status='active'), sin pagos → 409 has_related_projects, NO se borra", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await makeClient();
    const project = await createProject({ clientId: client.id, name: "Proyecto activo", totalAmount: 1000 });
    await setProjectPaidAmount(project.id, 0, "active");

    const res = await DELETE(makeRequest(), makeContext(client.id));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("has_related_projects");
    expect(await getClientById(client.id)).not.toBeNull();
  });

  /**
   * Fase 5C-fix (auditoría de eliminación de proyectos): este es el caso
   * exacto que falló en producción con Angel Rojas/PRUEBA XAYVEN — un
   * proyecto en negociación (awaiting_payment, el default de
   * createProject), sin ninguna fila en `payments`. Antes de este fix,
   * classifyClientImportance() devolvía "important" (no "protected") y
   * dejaba pasar el DELETE real, que Postgres rechazaba con un 500
   * genérico. Ahora debe bloquearse ANTES de intentar el DELETE, con un
   * 409 que explica la causa.
   */
  it("cliente con proyecto en negociación (awaiting_payment) SIN pagos → 409 has_related_projects, NO se borra (antes era el bug reportado)", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await makeClient();
    await createProject({ clientId: client.id, name: "Proyecto en negociación", totalAmount: 1000 });

    const res = await DELETE(makeRequest(), makeContext(client.id));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("has_related_projects");
    expect(await getClientById(client.id)).not.toBeNull();
  });

  it("solo exporta DELETE — Next.js rechaza GET/POST/PUT/PATCH automáticamente (405)", () => {
    expect("GET" in routeModule).toBe(false);
    expect("POST" in routeModule).toBe(false);
    expect("PUT" in routeModule).toBe(false);
    expect("PATCH" in routeModule).toBe(false);
  });
});
