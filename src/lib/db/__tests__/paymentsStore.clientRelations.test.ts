import { describe, it, expect } from "vitest";
import {
  createClient as createPaymentsClient,
  createProject,
  createPayment,
  listProjects,
  listPayments,
} from "@/lib/db/paymentsStore";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// paymentsStore.ts transparently uses its in-memory fallback — real (if
// ephemeral) round-trips, same pattern as
// src/lib/payments/__tests__/service.test.ts.

async function makeClient() {
  return createPaymentsClient({
    name: "Cliente de prueba",
    email: `t-${Date.now()}-${Math.random()}@example.com`,
  });
}

describe("listProjects — filtro por clientId (Fase 5B)", () => {
  it("devuelve solo los proyectos del cliente pedido", async () => {
    const clientA = await makeClient();
    const clientB = await makeClient();
    const projectA = await createProject({ clientId: clientA.id, name: "Proyecto A", totalAmount: 1000 });
    await createProject({ clientId: clientB.id, name: "Proyecto B", totalAmount: 2000 });

    const result = await listProjects({ clientId: clientA.id });

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(projectA.id);
  });

  it("cliente sin proyectos → arreglo vacío", async () => {
    const client = await makeClient();

    const result = await listProjects({ clientId: client.id });

    expect(result).toEqual([]);
  });

  it("sin filtro → sigue devolviendo todos (compatibilidad hacia atrás)", async () => {
    const before = await listProjects();
    const client = await makeClient();
    await createProject({ clientId: client.id, name: "Otro proyecto", totalAmount: 500 });
    const after = await listProjects();

    expect(after.length).toBe(before.length + 1);
  });
});

describe("listPayments — filtro por clientId (Fase 5B)", () => {
  it("devuelve solo los pagos del cliente pedido", async () => {
    const clientA = await makeClient();
    const clientB = await makeClient();
    const projectA = await createProject({ clientId: clientA.id, name: "Proyecto A", totalAmount: 1000 });
    const projectB = await createProject({ clientId: clientB.id, name: "Proyecto B", totalAmount: 1000 });

    const paymentA = await createPayment({
      projectId: projectA.id,
      clientId: clientA.id,
      provider: "WOMPI",
      reference: `REF-${Date.now()}-A`,
      amount: 500,
      currency: "COP",
      paymentType: "DEPOSIT",
    });
    await createPayment({
      projectId: projectB.id,
      clientId: clientB.id,
      provider: "WOMPI",
      reference: `REF-${Date.now()}-B`,
      amount: 500,
      currency: "COP",
      paymentType: "DEPOSIT",
    });

    const result = await listPayments({ clientId: clientA.id });

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(paymentA.id);
  });

  it("cliente sin pagos → arreglo vacío", async () => {
    const client = await makeClient();

    const result = await listPayments({ clientId: client.id });

    expect(result).toEqual([]);
  });
});
