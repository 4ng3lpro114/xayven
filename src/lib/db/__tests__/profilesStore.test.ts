import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Never touches real Supabase — mocks getSupabaseAdmin() entirely, same
 * boundary paymentsStore.createSupabaseErrors.test.ts already mocks at.
 * Unlike paymentsStore, profilesStore has no in-memory fallback mode at
 * all (profiles only ever exists via real Supabase Auth) — every case
 * here is a real-or-fake Supabase client, never a memory Map.
 */
// update(...).eq(...).select(...).single() — setProfileClientId's chain.
const singleMock = vi.fn();
const selectUpdateMock = vi.fn(() => ({ single: singleMock }));
const eqMock = vi.fn(() => ({ select: selectUpdateMock }));
const updateMock = vi.fn(() => ({ eq: eqMock }));

// select(...).not(...) — listLinkedProfileClientIds's chain. A separate
// mock instance from selectUpdateMock above (different parent in the
// chain: .from() directly vs .update().eq()), so both can coexist
// without interfering with each other.
const notMock = vi.fn();
const selectListMock = vi.fn(() => ({ not: notMock }));

const fromMock = vi.fn(() => ({ update: updateMock, select: selectListMock }));
const getSupabaseAdminMock = vi.fn();

vi.mock("@/lib/db/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { setProfileClientId, listLinkedProfileClientIds } from "../profilesStore";

describe("setProfileClientId", () => {
  beforeEach(() => {
    singleMock.mockReset();
    selectUpdateMock.mockClear();
    eqMock.mockClear();
    updateMock.mockClear();
    notMock.mockReset();
    selectListMock.mockClear();
    fromMock.mockClear();
    getSupabaseAdminMock.mockReset();
    getSupabaseAdminMock.mockReturnValue({ from: fromMock });
  });

  it("éxito → actualiza profiles.client_id filtrando por id, sin lanzar", async () => {
    singleMock.mockResolvedValue({ data: { id: "user-1" }, error: null });

    await expect(setProfileClientId("user-1", "client-1")).resolves.toBeUndefined();

    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(updateMock).toHaveBeenCalledWith({ client_id: "client-1" });
    expect(eqMock).toHaveBeenCalledWith("id", "user-1");
  });

  it("getSupabaseAdmin() no disponible (service role no configurado) → lanza, nunca finge éxito", async () => {
    getSupabaseAdminMock.mockReturnValue(null);

    await expect(setProfileClientId("user-1", "client-1")).rejects.toThrow(
      /service role not configured/
    );
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("Supabase devuelve error → lanza, nunca finge éxito", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });

    await expect(setProfileClientId("user-1", "client-1")).rejects.toThrow(
      /setProfileClientId failed/
    );
  });

  it("update no afecta ninguna fila (data null, sin error explícito) → lanza igual", async () => {
    singleMock.mockResolvedValue({ data: null, error: null });

    await expect(setProfileClientId("user-does-not-exist", "client-1")).rejects.toThrow(
      /setProfileClientId failed/
    );
  });
});

describe("listLinkedProfileClientIds", () => {
  beforeEach(() => {
    notMock.mockReset();
    selectListMock.mockClear();
    fromMock.mockClear();
    getSupabaseAdminMock.mockReset();
    getSupabaseAdminMock.mockReturnValue({ from: fromMock });
  });

  it("devuelve el set de client_id no nulos, filtrando explícitamente por IS NOT NULL", async () => {
    notMock.mockResolvedValue({
      data: [{ client_id: "client-1" }, { client_id: "client-2" }],
    });

    const result = await listLinkedProfileClientIds();

    expect(result).toEqual(new Set(["client-1", "client-2"]));
    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(selectListMock).toHaveBeenCalledWith("client_id");
    expect(notMock).toHaveBeenCalledWith("client_id", "is", null);
  });

  it("deduplica automáticamente (Set) si hubiera valores repetidos", async () => {
    notMock.mockResolvedValue({
      data: [{ client_id: "client-1" }, { client_id: "client-1" }],
    });

    const result = await listLinkedProfileClientIds();

    expect(result.size).toBe(1);
    expect(result.has("client-1")).toBe(true);
  });

  it("sin filas → set vacío, no lanza", async () => {
    notMock.mockResolvedValue({ data: [] });

    const result = await listLinkedProfileClientIds();

    expect(result).toEqual(new Set());
  });

  it("data null (respuesta inesperada) → set vacío, nunca lanza (es una lectura de display, no una escritura)", async () => {
    notMock.mockResolvedValue({ data: null });

    const result = await listLinkedProfileClientIds();

    expect(result).toEqual(new Set());
  });

  it("getSupabaseAdmin() no disponible → set vacío (fail-soft), nunca lanza, nunca llama a Supabase", async () => {
    getSupabaseAdminMock.mockReturnValue(null);

    const result = await listLinkedProfileClientIds();

    expect(result).toEqual(new Set());
    expect(fromMock).not.toHaveBeenCalled();
  });
});
