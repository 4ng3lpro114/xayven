import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  convertContactRequestToClient,
  ContactRequestConversionError,
} from "@/lib/leads/contactRequestConversion";
import { createContactRequest, getContactRequestById } from "@/lib/db/contactRequestStore";
import { createClientOrGetExisting, getClientById, deleteClient } from "@/lib/db/paymentsStore";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// both contactRequestStore.ts and paymentsStore.ts transparently use their
// in-memory fallback — real (if ephemeral) read/write round-trips through
// the actual store functions, not mocks. Same pattern as
// src/lib/leads/__tests__/conversion.test.ts.

function makeInput(overrides: Partial<Parameters<typeof createContactRequest>[0]> = {}) {
  return {
    name: "Diana",
    email: `diana-${randomUUID()}@example.com`,
    company: "Aguacates",
    projectType: "Sitio web nuevo",
    budget: "Menos de $1.000.000 COP",
    message: "Necesito un sitio web para mi negocio de aguacates.",
    ...overrides,
  };
}

describe("convertContactRequestToClient — cliente nuevo", () => {
  it("crea un cliente con name/email/company propagados desde la solicitud", async () => {
    const input = makeInput();
    const request = await createContactRequest(input);

    const result = await convertContactRequestToClient(request.id);

    expect(result.clientWasCreated).toBe(true);
    expect(result.client.name).toBe(input.name);
    expect(result.client.email).toBe(input.email);
    expect(result.client.company).toBe(input.company);
    // No hay campo de teléfono en el formulario de contacto — nunca se
    // inventa, queda null, completable después desde Clientes.
    expect(result.client.phone).toBeNull();
  });

  it("propaga company=null cuando la solicitud no la trae", async () => {
    const request = await createContactRequest(makeInput({ company: null }));
    const result = await convertContactRequestToClient(request.id);
    expect(result.client.company).toBeNull();
  });

  it("fija status='converted' y client_id en la solicitud — nunca converted sin cliente", async () => {
    const request = await createContactRequest(makeInput());
    expect(request.status).toBe("new");
    expect(request.clientId).toBeNull();

    const result = await convertContactRequestToClient(request.id);

    expect(result.contactRequest.status).toBe("converted");
    expect(result.contactRequest.clientId).toBe(result.client.id);
  });

  it("la solicitud permanece intacta como historial — todos los datos originales sobreviven a la conversión", async () => {
    const input = makeInput();
    const request = await createContactRequest(input);
    const result = await convertContactRequestToClient(request.id);

    const stillThere = await getContactRequestById(request.id);
    expect(stillThere?.name).toBe(input.name);
    expect(stillThere?.email).toBe(input.email);
    expect(stillThere?.company).toBe(input.company);
    expect(stillThere?.projectType).toBe(input.projectType);
    expect(stillThere?.budget).toBe(input.budget);
    expect(stillThere?.message).toBe(input.message);
    expect(stillThere?.clientId).toBe(result.client.id);
  });
});

describe("convertContactRequestToClient — deduplicación por email", () => {
  it("reutiliza un cliente ya existente con el mismo email en vez de duplicarlo", async () => {
    const email = `existing-${randomUUID()}@example.com`;
    const { client: existingClient } = await createClientOrGetExisting({
      name: "Diana Preexistente",
      email,
    });

    const request = await createContactRequest(makeInput({ email }));
    const result = await convertContactRequestToClient(request.id);

    expect(result.clientWasCreated).toBe(false);
    expect(result.client.id).toBe(existingClient.id);
  });

  it("dos solicitudes distintas con el mismo email convergen al mismo cliente, nunca duplicado", async () => {
    const email = `same-${randomUUID()}@example.com`;
    const requestA = await createContactRequest(makeInput({ email, name: "Diana A" }));
    const requestB = await createContactRequest(makeInput({ email, name: "Diana B" }));

    const resultA = await convertContactRequestToClient(requestA.id);
    const resultB = await convertContactRequestToClient(requestB.id);

    expect(resultA.client.id).toBe(resultB.client.id);
    expect(resultB.clientWasCreated).toBe(false);
  });
});

describe("convertContactRequestToClient — idempotencia", () => {
  it("llamar dos veces sobre la misma solicitud ya convertida no crea otro cliente ni cambia nada", async () => {
    const request = await createContactRequest(makeInput());
    const first = await convertContactRequestToClient(request.id);

    const before = await getClientById(first.client.id);
    const second = await convertContactRequestToClient(request.id);
    const after = await getClientById(first.client.id);

    expect(second.client.id).toBe(first.client.id);
    expect(second.clientWasCreated).toBe(false);
    // Ni siquiera se reescribe el cliente — mismo updated_at exacto.
    expect(after?.updatedAt).toBe(before?.updatedAt);
  });
});

describe("convertContactRequestToClient — errores", () => {
  it("solicitud inexistente → ContactRequestConversionError('not_found')", async () => {
    await expect(
      convertContactRequestToClient("00000000-0000-0000-0000-000000000000")
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      convertContactRequestToClient("00000000-0000-0000-0000-000000000000")
    ).rejects.toBeInstanceOf(ContactRequestConversionError);
  });
});

/**
 * Recovery after the linked client is deleted. Since
 * deleteClient()'s in-memory branch now calls
 * nullifyClientIdInContactRequestsMemory() (parity with real Supabase's
 * ON DELETE SET NULL — see paymentsStore.test additions), `clientId`
 * becomes null automatically, exactly as it would in production. This
 * means the request always re-enters convertContactRequestToClient()'s
 * "no clientId yet" branch — the ContactRequestConversionError
 * ("client_not_found") path this function still has stays as defense in
 * depth for a dangling reference that shouldn't be reachable through this
 * codebase's own delete path anymore, not something exercised by the
 * normal recovery flow tested here.
 */
describe("convertContactRequestToClient — recuperación tras eliminar el cliente vinculado", () => {
  it("status se conserva 'converted' y clientId queda null — estado recuperable, nunca revertido a new/contacted", async () => {
    const request = await createContactRequest(makeInput());
    const result = await convertContactRequestToClient(request.id);
    await deleteClient(result.client.id);

    const afterDelete = await getContactRequestById(request.id);
    expect(afterDelete?.status).toBe("converted");
    expect(afterDelete?.clientId).toBeNull();
  });

  it("volver a convertir tras la eliminación crea un cliente nuevo (el original ya no existe) y re-vincula correctamente", async () => {
    const request = await createContactRequest(makeInput());
    const first = await convertContactRequestToClient(request.id);
    await deleteClient(first.client.id);

    const recovered = await convertContactRequestToClient(request.id);

    expect(recovered.clientWasCreated).toBe(true);
    expect(recovered.client.id).not.toBe(first.client.id);
    expect(recovered.contactRequest.status).toBe("converted");
    expect(recovered.contactRequest.clientId).toBe(recovered.client.id);
  });

  it("si ya existe otro cliente con el mismo email al recuperar, lo reutiliza en vez de duplicar", async () => {
    const request = await createContactRequest(makeInput());
    const first = await convertContactRequestToClient(request.id);
    await deleteClient(first.client.id);

    // Alguien (u otro flujo) ya volvió a crear un cliente con ese mismo
    // email antes de que se reintente la conversión de esta solicitud.
    const { client: recreatedByEmail } = await createClientOrGetExisting({
      name: request.name,
      email: request.email,
    });

    const recovered = await convertContactRequestToClient(request.id);

    expect(recovered.clientWasCreated).toBe(false);
    expect(recovered.client.id).toBe(recreatedByEmail.id);
  });

  it("un segundo intento de recuperación sobre la misma solicitud ya recuperada es idempotente", async () => {
    const request = await createContactRequest(makeInput());
    const first = await convertContactRequestToClient(request.id);
    await deleteClient(first.client.id);

    const recovered = await convertContactRequestToClient(request.id);
    const secondAttempt = await convertContactRequestToClient(request.id);

    expect(secondAttempt.client.id).toBe(recovered.client.id);
    expect(secondAttempt.clientWasCreated).toBe(false);
  });
});
