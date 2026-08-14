import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createContactRequest,
  getContactRequestById,
  listContactRequests,
  updateContactRequestStatus,
  linkContactRequestToClient,
  ContactRequestNotFoundError,
} from "@/lib/db/contactRequestStore";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// contactRequestStore.ts transparently uses its in-memory fallback — real
// (if ephemeral) round-trips, same pattern as maintenanceStore.test.ts /
// promotionStore.test.ts.

function makeInput(overrides: Partial<Parameters<typeof createContactRequest>[0]> = {}) {
  return {
    name: "Diana",
    email: `${randomUUID()}@example.com`,
    company: "Aguacates",
    projectType: "Sitio web nuevo",
    budget: "Menos de $1.000.000 COP",
    message: "Necesito un sitio web para mi negocio de aguacates.",
    ...overrides,
  };
}

describe("createContactRequest / getContactRequestById", () => {
  it("una solicitud creada tiene status 'new' y clientId null por defecto, y conserva todos los campos originales", async () => {
    const input = makeInput();
    const created = await createContactRequest(input);

    expect(created.status).toBe("new");
    expect(created.clientId).toBeNull();
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();

    const fetched = await getContactRequestById(created.id);
    expect(fetched).toEqual(created);
    expect(fetched?.name).toBe(input.name);
    expect(fetched?.email).toBe(input.email);
    expect(fetched?.company).toBe(input.company);
    expect(fetched?.projectType).toBe(input.projectType);
    expect(fetched?.budget).toBe(input.budget);
    expect(fetched?.message).toBe(input.message);
  });

  it("company puede ser null (campo opcional del formulario)", async () => {
    const created = await createContactRequest(makeInput({ company: null }));
    expect(created.company).toBeNull();
  });

  it("getContactRequestById devuelve null para un id inexistente", async () => {
    const result = await getContactRequestById("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });
});

describe("listContactRequests", () => {
  it("una solicitud creada aparece en el listado", async () => {
    const input = makeInput();
    await createContactRequest(input);

    const all = await listContactRequests();
    expect(all.some((r) => r.email === input.email)).toBe(true);
  });

  it("filtra por status, incluyendo 'converted'", async () => {
    const created = await createContactRequest(makeInput());
    await linkContactRequestToClient(created.id, randomUUID());

    const converted = await listContactRequests({ status: "converted" });
    expect(converted.some((r) => r.id === created.id)).toBe(true);

    const stillNew = await listContactRequests({ status: "new" });
    expect(stillNew.some((r) => r.id === created.id)).toBe(false);
  });

  it("respeta el límite pasado", async () => {
    const limited = await listContactRequests({ limit: 0 });
    expect(limited).toHaveLength(0);
  });
});

describe("updateContactRequestStatus (solo new ⇄ contacted)", () => {
  it("recorre el ciclo new → contacted", async () => {
    const created = await createContactRequest(makeInput());
    expect(created.status).toBe("new");

    const contacted = await updateContactRequestStatus(created.id, "contacted");
    expect(contacted.status).toBe("contacted");
  });

  it("permite mover de vuelta 'contacted' → 'new' (sin cadena forward-only)", async () => {
    const created = await createContactRequest(makeInput());
    await updateContactRequestStatus(created.id, "contacted");
    const back = await updateContactRequestStatus(created.id, "new");
    expect(back.status).toBe("new");
  });

  it("nunca pierde los datos originales al cambiar de estado", async () => {
    const input = makeInput();
    const created = await createContactRequest(input);
    const updated = await updateContactRequestStatus(created.id, "contacted");

    expect(updated.name).toBe(input.name);
    expect(updated.email).toBe(input.email);
    expect(updated.message).toBe(input.message);
  });

  it("id inexistente → lanza ContactRequestNotFoundError", async () => {
    await expect(
      updateContactRequestStatus("00000000-0000-0000-0000-000000000000", "contacted")
    ).rejects.toThrow(ContactRequestNotFoundError);
  });
});

describe("linkContactRequestToClient — la única forma de llegar a 'converted'", () => {
  it("fija status='converted' y clientId en la misma escritura", async () => {
    const created = await createContactRequest(makeInput());
    const clientId = randomUUID();

    const linked = await linkContactRequestToClient(created.id, clientId);
    expect(linked.status).toBe("converted");
    expect(linked.clientId).toBe(clientId);
  });

  it("nunca pierde los datos originales de la solicitud (permanece como historial)", async () => {
    const input = makeInput();
    const created = await createContactRequest(input);
    const linked = await linkContactRequestToClient(created.id, randomUUID());

    expect(linked.name).toBe(input.name);
    expect(linked.email).toBe(input.email);
    expect(linked.company).toBe(input.company);
    expect(linked.message).toBe(input.message);
  });

  it("id inexistente → lanza ContactRequestNotFoundError", async () => {
    await expect(
      linkContactRequestToClient("00000000-0000-0000-0000-000000000000", randomUUID())
    ).rejects.toThrow(ContactRequestNotFoundError);
  });
});
