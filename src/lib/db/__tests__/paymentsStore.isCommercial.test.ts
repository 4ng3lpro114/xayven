import { describe, it, expect } from "vitest";
import {
  createClient as createPaymentsClient,
  createClientOrGetExisting,
  markClientAsCommercial,
} from "@/lib/db/paymentsStore";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// paymentsStore.ts transparently uses its in-memory fallback — same
// pattern as paymentsStore.clientRelations.test.ts.

function uniqueEmail(): string {
  return `t-${Date.now()}-${Math.random()}@example.com`;
}

describe("clients.is_commercial (0012_clients_is_commercial.sql)", () => {
  it("createClient() sin isCommercial → true por defecto (Lead/Solicitud/proyecto directo, sin cambio de comportamiento)", async () => {
    const client = await createPaymentsClient({ name: "Cliente", email: uniqueEmail() });
    expect(client.isCommercial).toBe(true);
  });

  it("createClient({ isCommercial: false }) → cuenta XAYVEN sin cliente comercial", async () => {
    const client = await createPaymentsClient({
      name: "Cuenta nueva",
      email: uniqueEmail(),
      isCommercial: false,
    });
    expect(client.isCommercial).toBe(false);
  });

  it("createClientOrGetExisting() sin isCommercial → true por defecto", async () => {
    const { client } = await createClientOrGetExisting({ name: "Cliente", email: uniqueEmail() });
    expect(client.isCommercial).toBe(true);
  });

  it("createClientOrGetExisting({ isCommercial: false }) crea una cuenta-sin-cliente; una segunda llamada con isCommercial:true para el MISMO email reutiliza la fila sin promoverla (la promoción es responsabilidad explícita del caller, no de esta primitiva)", async () => {
    const email = uniqueEmail();
    const first = await createClientOrGetExisting({ name: "Cuenta", email, isCommercial: false });
    expect(first.created).toBe(true);
    expect(first.client.isCommercial).toBe(false);

    const second = await createClientOrGetExisting({ name: "Solicitud", email, isCommercial: true });
    expect(second.created).toBe(false);
    expect(second.client.id).toBe(first.client.id);
    // Sigue false — createClientOrGetExisting nunca promueve por sí sola.
    expect(second.client.isCommercial).toBe(false);
  });

  it("markClientAsCommercial() promueve is_commercial=false → true", async () => {
    const created = await createPaymentsClient({
      name: "Cuenta",
      email: uniqueEmail(),
      isCommercial: false,
    });
    expect(created.isCommercial).toBe(false);

    const promoted = await markClientAsCommercial(created.id);
    expect(promoted.isCommercial).toBe(true);
    expect(promoted.id).toBe(created.id);
  });

  it("markClientAsCommercial() es idempotente — repetirlo sobre un cliente ya comercial no falla y sigue true", async () => {
    const created = await createPaymentsClient({ name: "Cliente", email: uniqueEmail() });
    expect(created.isCommercial).toBe(true);

    const promoted = await markClientAsCommercial(created.id);
    expect(promoted.isCommercial).toBe(true);
  });

  it("markClientAsCommercial() sobre un id inexistente lanza, nunca fabrica un éxito falso", async () => {
    await expect(markClientAsCommercial("no-existe")).rejects.toThrow(/not found/);
  });
});
