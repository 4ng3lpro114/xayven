import { describe, it, expect } from "vitest";
import { createClient as createPaymentsClient, getClientById, deleteClient } from "@/lib/db/paymentsStore";
import { createContactRequest, getContactRequestById, linkContactRequestToClient } from "@/lib/db/contactRequestStore";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// paymentsStore.ts transparently uses its in-memory fallback — real
// round-trips, same pattern as the rest of this project's store tests.

async function makeClient() {
  return createPaymentsClient({
    name: "Cliente de prueba",
    email: `t-${Date.now()}-${Math.random()}@example.com`,
  });
}

describe("deleteClient", () => {
  it("borra un cliente existente — deleted: true, y ya no es encontrable después", async () => {
    const client = await makeClient();

    const result = await deleteClient(client.id);

    expect(result.deleted).toBe(true);
    expect(await getClientById(client.id)).toBeNull();
  });

  it("un id inexistente → deleted: false, sin lanzar", async () => {
    const result = await deleteClient("00000000-0000-0000-0000-000000000000");

    expect(result.deleted).toBe(false);
  });

  it("borrar dos veces el mismo cliente → la segunda vez deleted: false", async () => {
    const client = await makeClient();

    const first = await deleteClient(client.id);
    const second = await deleteClient(client.id);

    expect(first.deleted).toBe(true);
    expect(second.deleted).toBe(false);
  });

  it("borrar un cliente vinculado a una solicitud convertida deja clientId en null pero conserva status='converted' (paridad con ON DELETE SET NULL)", async () => {
    const client = await makeClient();
    const request = await createContactRequest({
      name: "Diana",
      email: `diana-${Date.now()}@example.com`,
      company: "Aguacates",
      projectType: "Sitio web nuevo",
      budget: "Menos de $1.000.000 COP",
      message: "Necesito ayuda con mi proyecto.",
    });
    await linkContactRequestToClient(request.id, client.id);

    await deleteClient(client.id);

    const afterDelete = await getContactRequestById(request.id);
    expect(afterDelete?.clientId).toBeNull();
    // El estado histórico NUNCA se revierte automáticamente — ver
    // nullifyClientIdInContactRequestsMemory()'s doc comment.
    expect(afterDelete?.status).toBe("converted");
  });
});
