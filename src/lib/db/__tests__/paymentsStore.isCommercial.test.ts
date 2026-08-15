import { describe, it, expect } from "vitest";
import {
  createClient as createPaymentsClient,
  createClientOrGetExisting,
  markClientAsCommercial,
  markClientAsNonCommercial,
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

  it("markClientAsNonCommercial() despromueve is_commercial=true → false (espejo exacto de markClientAsCommercial)", async () => {
    const created = await createPaymentsClient({ name: "Cliente real", email: uniqueEmail() });
    expect(created.isCommercial).toBe(true);

    const downgraded = await markClientAsNonCommercial(created.id);
    expect(downgraded.isCommercial).toBe(false);
    expect(downgraded.id).toBe(created.id);
  });

  it("markClientAsNonCommercial() es idempotente — repetirlo sobre un cliente ya no-comercial no falla y sigue false", async () => {
    const created = await createPaymentsClient({
      name: "Cuenta",
      email: uniqueEmail(),
      isCommercial: false,
    });

    const downgraded = await markClientAsNonCommercial(created.id);
    expect(downgraded.isCommercial).toBe(false);
  });

  it("markClientAsNonCommercial() sobre un id inexistente lanza, nunca fabrica un éxito falso", async () => {
    await expect(markClientAsNonCommercial("no-existe")).rejects.toThrow(/not found/);
  });

  it("promover y despromover son reversibles sobre la MISMA fila — nunca se crea una segunda (G. doble operación)", async () => {
    const created = await createPaymentsClient({
      name: "Cuenta",
      email: uniqueEmail(),
      isCommercial: false,
    });

    const up = await markClientAsCommercial(created.id);
    const down = await markClientAsNonCommercial(up.id);
    const upAgain = await markClientAsCommercial(down.id);

    expect(up.id).toBe(created.id);
    expect(down.id).toBe(created.id);
    expect(upAgain.id).toBe(created.id);
    expect(upAgain.isCommercial).toBe(true);
  });
});
