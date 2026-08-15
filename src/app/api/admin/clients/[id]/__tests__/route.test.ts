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

/**
 * listLinkedProfileClientIds() has no in-memory-mode account tracking of
 * its own (see profilesStore.ts — it returns an empty Set whenever the
 * service role isn't configured, which is always true in this test
 * environment). Mocked here so tests can control exactly which client id
 * "has a linked XAYVEN account" — same technique already used by
 * accountClientLink.test.ts. Defaults to an empty Set (no linked
 * accounts), which is what every pre-existing test in this file already
 * implicitly assumed — their hard-delete assertions stay correct
 * unchanged.
 */
const listLinkedProfileClientIdsMock = vi.fn();
vi.mock("@/lib/db/profilesStore", () => ({
  listLinkedProfileClientIds: () => listLinkedProfileClientIdsMock(),
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
    listLinkedProfileClientIdsMock.mockReset();
    // Por defecto, ningún cliente tiene cuenta vinculada — preserva el
    // comportamiento de todos los tests que ya existían antes de
    // 0012_clients_is_commercial.sql.
    listLinkedProfileClientIdsMock.mockResolvedValue(new Set());
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

  it("cliente sin proyectos/pagos, SIN cuenta XAYVEN (normal) → 200, downgraded: false, y realmente desaparece (comportamiento actual, sin cambios)", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await makeClient();

    const res = await DELETE(makeRequest(), makeContext(client.id));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.downgraded).toBe(false);
    expect(await getClientById(client.id)).toBeNull();
  });

  describe("0012_clients_is_commercial.sql — 'Eliminar cliente' con cuenta XAYVEN vinculada", () => {
    it("cliente comercial CON cuenta vinculada, sin proyectos/pagos → 200, downgraded: true, is_commercial pasa a false, la fila NO se borra", async () => {
      requireAdminSessionMock.mockResolvedValue(true);
      const client = await makeClient();
      listLinkedProfileClientIdsMock.mockResolvedValue(new Set([client.id]));

      const res = await DELETE(makeRequest(), makeContext(client.id));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.downgraded).toBe(true);

      // La fila sigue existiendo — nunca se llegó a deleteClient().
      const reloaded = await getClientById(client.id);
      expect(reloaded).not.toBeNull();
      expect(reloaded?.isCommercial).toBe(false);
      // La cuenta permanece intacta — nada en este flujo toca profiles.
      expect(reloaded?.id).toBe(client.id);
    });

    it("cliente comercial CON cuenta vinculada pero protegido (tiene un proyecto) → sigue 409, la protección gana ANTES de decidir downgrade vs delete", async () => {
      requireAdminSessionMock.mockResolvedValue(true);
      const client = await makeClient();
      listLinkedProfileClientIdsMock.mockResolvedValue(new Set([client.id]));
      await createProject({ clientId: client.id, name: "Proyecto activo", totalAmount: 1000 });

      const res = await DELETE(makeRequest(), makeContext(client.id));

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("has_related_projects");
      const reloaded = await getClientById(client.id);
      expect(reloaded?.isCommercial).toBe(true); // sin tocar, ni downgrade ni delete
    });

    it("repetir la operación dos veces sobre el mismo cliente con cuenta → idempotente, sigue existiendo una sola fila, no revienta (G. doble operación)", async () => {
      requireAdminSessionMock.mockResolvedValue(true);
      const client = await makeClient();
      listLinkedProfileClientIdsMock.mockResolvedValue(new Set([client.id]));

      const first = await DELETE(makeRequest(), makeContext(client.id));
      const second = await DELETE(makeRequest(), makeContext(client.id));

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect((await second.json()).downgraded).toBe(true);
      const reloaded = await getClientById(client.id);
      expect(reloaded).not.toBeNull();
      expect(reloaded?.isCommercial).toBe(false);
    });
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
