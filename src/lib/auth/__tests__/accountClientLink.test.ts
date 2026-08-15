import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit-level: mocks paymentsStore/profilesStore at the module boundary —
 * same technique register/route.test.ts already uses for supabaseServer.
 * Never touches real Supabase. The cross-flow guarantee ("Solicitud →
 * Cliente ← Cuenta" converge on the same client without duplicating) is
 * covered separately in accountClientLink.crossFlow.test.ts, which
 * exercises the REAL paymentsStore primitives against a fake DB instead
 * of mocking them — that's the test that actually proves no duplication,
 * not this file.
 */
const getClientByNormalizedEmailMock = vi.fn();
const createClientOrGetExistingMock = vi.fn();
const setProfileClientIdMock = vi.fn();

vi.mock("@/lib/db/paymentsStore", () => ({
  getClientByNormalizedEmail: (...args: unknown[]) => getClientByNormalizedEmailMock(...args),
  createClientOrGetExisting: (...args: unknown[]) => createClientOrGetExistingMock(...args),
}));

vi.mock("@/lib/db/profilesStore", () => ({
  setProfileClientId: (...args: unknown[]) => setProfileClientIdMock(...args),
}));

import { linkAccountToClient, type LinkAccountToClientInput } from "../accountClientLink";

function makeClient(overrides: Partial<{ id: string; email: string; name: string }> = {}) {
  return {
    id: "client-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    name: "Diana Pérez",
    email: "diana@example.com",
    phone: null,
    company: null,
    ...overrides,
  };
}

describe("linkAccountToClient", () => {
  beforeEach(() => {
    getClientByNormalizedEmailMock.mockReset();
    createClientOrGetExistingMock.mockReset();
    setProfileClientIdMock.mockReset();
    setProfileClientIdMock.mockResolvedValue(undefined);
  });

  it("A. client inexistente → lo crea vía createClientOrGetExisting y vincula, clientWasCreated=true", async () => {
    getClientByNormalizedEmailMock.mockResolvedValue(null);
    createClientOrGetExistingMock.mockResolvedValue({ client: makeClient(), created: true });

    const result = await linkAccountToClient({
      userId: "user-1",
      fullName: "Diana Pérez",
      email: "diana@example.com",
    });

    expect(result).toEqual({ clientId: "client-1", clientWasCreated: true });
    expect(getClientByNormalizedEmailMock).toHaveBeenCalledWith("diana@example.com");
    expect(createClientOrGetExistingMock).toHaveBeenCalledWith({
      name: "Diana Pérez",
      email: "diana@example.com",
      phone: null,
      company: null,
    });
    expect(setProfileClientIdMock).toHaveBeenCalledWith("user-1", "client-1");
  });

  it("B. client existente por email → lo reutiliza, NO llama a createClientOrGetExisting, clientWasCreated=false", async () => {
    getClientByNormalizedEmailMock.mockResolvedValue(makeClient({ id: "client-existing" }));

    const result = await linkAccountToClient({
      userId: "user-1",
      fullName: "Diana Pérez",
      email: "diana@example.com",
    });

    expect(result).toEqual({ clientId: "client-existing", clientWasCreated: false });
    expect(createClientOrGetExistingMock).not.toHaveBeenCalled();
    expect(setProfileClientIdMock).toHaveBeenCalledWith("user-1", "client-existing");
  });

  it("C. email con mayúsculas → se normaliza (lowercase) antes de buscar el client existente", async () => {
    getClientByNormalizedEmailMock.mockResolvedValue(makeClient({ id: "client-existing" }));

    await linkAccountToClient({ userId: "user-1", fullName: "Diana", email: "Diana@Example.COM" });

    expect(getClientByNormalizedEmailMock).toHaveBeenCalledWith("diana@example.com");
  });

  it("D. email con espacios → se normaliza (trim) antes de buscar el client existente", async () => {
    getClientByNormalizedEmailMock.mockResolvedValue(makeClient({ id: "client-existing" }));

    await linkAccountToClient({ userId: "user-1", fullName: "Diana", email: "  diana@example.com  " });

    expect(getClientByNormalizedEmailMock).toHaveBeenCalledWith("diana@example.com");
  });

  it("E. ejecución repetida para el mismo email → no crea un segundo client", async () => {
    getClientByNormalizedEmailMock.mockResolvedValueOnce(null).mockResolvedValueOnce(makeClient());
    createClientOrGetExistingMock.mockResolvedValue({ client: makeClient(), created: true });

    const first = await linkAccountToClient({ userId: "user-1", fullName: "Diana", email: "diana@example.com" });
    const second = await linkAccountToClient({ userId: "user-2", fullName: "Diana", email: "diana@example.com" });

    expect(first.clientId).toBe("client-1");
    expect(second.clientId).toBe("client-1");
    expect(second.clientWasCreated).toBe(false);
    expect(createClientOrGetExistingMock).toHaveBeenCalledTimes(1);
  });

  it("F. setProfileClientId falla → el error se propaga, la vinculación nunca se reporta como exitosa", async () => {
    getClientByNormalizedEmailMock.mockResolvedValue(makeClient({ id: "client-existing" }));
    setProfileClientIdMock.mockRejectedValue(
      new Error("[profiles] setProfileClientId failed: service role not configured")
    );

    await expect(
      linkAccountToClient({ userId: "user-1", fullName: "Diana", email: "diana@example.com" })
    ).rejects.toThrow(/service role not configured/);
  });

  it("G. createClientOrGetExisting falla → el error se propaga al orquestador, nunca se intenta vincular", async () => {
    getClientByNormalizedEmailMock.mockResolvedValue(null);
    createClientOrGetExistingMock.mockRejectedValue(
      new Error("[leads] createClientOrGetExisting failed: 08006")
    );

    await expect(
      linkAccountToClient({ userId: "user-1", fullName: "Diana", email: "diana@example.com" })
    ).rejects.toThrow(/createClientOrGetExisting failed/);
    expect(setProfileClientIdMock).not.toHaveBeenCalled();
  });

  it("H. fallo al actualizar el profile (setProfileClientId) se detecta y se propaga, ya con un client resuelto", async () => {
    getClientByNormalizedEmailMock.mockResolvedValue(null);
    createClientOrGetExistingMock.mockResolvedValue({ client: makeClient(), created: true });
    setProfileClientIdMock.mockRejectedValue(
      new Error("[profiles] setProfileClientId failed: 42501 permission denied")
    );

    await expect(
      linkAccountToClient({ userId: "user-1", fullName: "Diana", email: "diana@example.com" })
    ).rejects.toThrow(/setProfileClientId failed/);
  });

  it("I. un client_id ajeno inyectado en el input es ignorado — la función no tiene ese parámetro y nunca lo lee", async () => {
    getClientByNormalizedEmailMock.mockResolvedValue(makeClient({ id: "client-real" }));

    // LinkAccountToClientInput no declara `clientId` — este cast simula lo
    // peor que un caller malicioso podría intentar colar en el objeto.
    const maliciousInput = {
      userId: "user-1",
      fullName: "Diana",
      email: "diana@example.com",
      clientId: "client-of-another-user",
    } as LinkAccountToClientInput & { clientId: string };

    const result = await linkAccountToClient(maliciousInput);

    expect(result.clientId).toBe("client-real");
    expect(setProfileClientIdMock).toHaveBeenCalledWith("user-1", "client-real");
    expect(setProfileClientIdMock).not.toHaveBeenCalledWith("user-1", "client-of-another-user");
  });
});
