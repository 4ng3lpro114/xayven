import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  createClient as createPaymentsClient,
  createProject,
  createPayment,
  updatePayment,
  setProjectPaidAmount,
  getProjectById,
} from "@/lib/db/paymentsStore";

/**
 * requireAdminSession() reads cookies() from next/headers, which needs
 * Next's per-request AsyncLocalStorage — unavailable when a route handler
 * is invoked directly outside a real Next.js request lifecycle, so it's
 * mocked here regardless of which auth outcome a given test wants.
 * Everything else is a real round-trip against the in-memory store — same
 * pattern as api/admin/clients/[id]/__tests__/route.test.ts. Nunca contra
 * Supabase real (Fase 8B regla absoluta).
 */
const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { DELETE } from "../route";
import * as routeModule from "../route";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/admin/projects/x", { method: "DELETE" });
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

describe("DELETE /api/admin/projects/[id]", () => {
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

  it("proyecto inexistente → 404", async () => {
    requireAdminSessionMock.mockResolvedValue(true);

    const res = await DELETE(makeRequest(), makeContext("00000000-0000-0000-0000-000000000000"));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("proyecto normal (status='cancelled', sin pagos) → 200, se borra realmente", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await makeClient();
    const project = await createProject({ clientId: client.id, name: "Cancelado", totalAmount: 1000 });
    await setProjectPaidAmount(project.id, 0, "cancelled");

    const res = await DELETE(makeRequest(), makeContext(project.id));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(await getProjectById(project.id)).toBeNull();
  });

  it("proyecto 'important' (awaiting_payment, sin pagos) → 200, sí se puede borrar (no está protegido)", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await makeClient();
    const project = await createProject({ clientId: client.id, name: "En negociación", totalAmount: 1000 });

    const res = await DELETE(makeRequest(), makeContext(project.id));

    expect(res.status).toBe(200);
    expect(await getProjectById(project.id)).toBeNull();
  });

  it("proyecto con una fila real de pago APPROVED en `payments` → 409 has_payments, NO se borra", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await makeClient();
    const project = await createProject({ clientId: client.id, name: "Pagado", totalAmount: 1000 });
    const payment = await createPayment({
      projectId: project.id,
      clientId: client.id,
      provider: "WOMPI",
      reference: `REF-${Date.now()}`,
      amount: 500,
      currency: "COP",
      paymentType: "DEPOSIT",
    });
    await updatePayment(payment.id, { status: "APPROVED" });

    const res = await DELETE(makeRequest(), makeContext(project.id));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("has_payments");
    expect(await getProjectById(project.id)).not.toBeNull();
  });

  it("proyecto con paid_amount > 0 (dinero real recibido) → 409 has_payments, NO se borra", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await makeClient();
    const project = await createProject({ clientId: client.id, name: "Con dinero", totalAmount: 1000 });
    await setProjectPaidAmount(project.id, 500, "awaiting_payment");

    const res = await DELETE(makeRequest(), makeContext(project.id));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("has_payments");
    expect(await getProjectById(project.id)).not.toBeNull();
  });

  it("proyecto con un pago PENDING (intento, sin dinero real) → 409 has_payment_attempts, NO se borra", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await makeClient();
    const project = await createProject({ clientId: client.id, name: "Intento sin dinero", totalAmount: 1000 });
    await createPayment({
      projectId: project.id,
      clientId: client.id,
      provider: "WOMPI",
      reference: `REF-${Date.now()}-pending`,
      amount: 500,
      currency: "COP",
      paymentType: "DEPOSIT",
    });

    const res = await DELETE(makeRequest(), makeContext(project.id));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("has_payment_attempts");
    expect(await getProjectById(project.id)).not.toBeNull();
  });

  it("proyecto en etapa de trabajo activa (status='active'), sin pagos → 409 active_work, NO se borra", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await makeClient();
    const project = await createProject({ clientId: client.id, name: "Activo sin pagos", totalAmount: 1000 });
    await setProjectPaidAmount(project.id, 0, "active");

    const res = await DELETE(makeRequest(), makeContext(project.id));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("active_work");
    expect(await getProjectById(project.id)).not.toBeNull();
  });

  it("borrar un proyecto NUNCA borra al cliente ni afecta otros proyectos del mismo cliente", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await makeClient();
    const toDelete = await createProject({ clientId: client.id, name: "A borrar", totalAmount: 1000 });
    await setProjectPaidAmount(toDelete.id, 0, "cancelled");
    const toKeep = await createProject({ clientId: client.id, name: "Se queda", totalAmount: 2000 });

    const res = await DELETE(makeRequest(), makeContext(toDelete.id));

    expect(res.status).toBe(200);
    const { getClientById } = await import("@/lib/db/paymentsStore");
    expect(await getClientById(client.id)).not.toBeNull();
    expect(await getProjectById(toKeep.id)).not.toBeNull();
  });

  it("solo exporta DELETE — Next.js rechaza GET/POST/PUT/PATCH automáticamente (405)", () => {
    expect("GET" in routeModule).toBe(false);
    expect("POST" in routeModule).toBe(false);
    expect("PUT" in routeModule).toBe(false);
    expect("PATCH" in routeModule).toBe(false);
  });
});
