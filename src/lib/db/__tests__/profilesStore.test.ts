import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Never touches real Supabase — mocks getSupabaseAdmin() entirely, same
 * boundary paymentsStore.createSupabaseErrors.test.ts already mocks at.
 * Unlike paymentsStore, profilesStore has no in-memory fallback mode at
 * all (profiles only ever exists via real Supabase Auth) — every case
 * here is a real-or-fake Supabase client, never a memory Map.
 */
const singleMock = vi.fn();
const selectMock = vi.fn(() => ({ single: singleMock }));
const eqMock = vi.fn(() => ({ select: selectMock }));
const updateMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ update: updateMock }));
const getSupabaseAdminMock = vi.fn();

vi.mock("@/lib/db/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { setProfileClientId } from "../profilesStore";

describe("setProfileClientId", () => {
  beforeEach(() => {
    singleMock.mockReset();
    selectMock.mockClear();
    eqMock.mockClear();
    updateMock.mockClear();
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
