import { describe, it, expect, vi } from "vitest";

/**
 * Isolated in its own file (same reasoning as every other mock-heavy test
 * in this project): mocking getSupabaseAdmin() to simulate a real
 * Supabase error would otherwise interfere with the real in-memory
 * round-trips in paymentsStore.deleteProject.test.ts. Never touches real
 * Supabase — this fakes the client entirely (Fase 8B regla absoluta: las
 * pruebas de DELETE solo contra mocks/fixtures).
 */
function makeFakeSupabase(result: { error: { code?: string; message?: string } | null; count: number | null }) {
  return {
    from: () => ({
      delete: () => ({
        eq: async () => result,
      }),
    }),
  };
}

describe("deleteProject — manejo de errores reales de Supabase (mockeado)", () => {
  it("error.code === '23503' → lanza ProjectDeleteConflictError con el pgCode correcto", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/supabase", () => ({
      getSupabaseAdmin: () =>
        makeFakeSupabase({
          error: { code: "23503", message: "internal detail that must never reach the client" },
          count: null,
        }),
    }));

    const { deleteProject, ProjectDeleteConflictError } = await import("@/lib/db/paymentsStore");

    await expect(deleteProject("some-id")).rejects.toBeInstanceOf(ProjectDeleteConflictError);

    try {
      await deleteProject("some-id");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ProjectDeleteConflictError);
      expect((err as InstanceType<typeof ProjectDeleteConflictError>).pgCode).toBe("23503");
    }

    vi.doUnmock("@/lib/db/supabase");
    vi.resetModules();
  });

  it("cualquier otro error de Supabase → Error genérico, NUNCA ProjectDeleteConflictError", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/supabase", () => ({
      getSupabaseAdmin: () =>
        makeFakeSupabase({ error: { code: "42501", message: "permission denied" }, count: null }),
    }));

    const { deleteProject, ProjectDeleteConflictError } = await import("@/lib/db/paymentsStore");

    await expect(deleteProject("some-id")).rejects.toThrow();
    await expect(deleteProject("some-id")).rejects.not.toBeInstanceOf(ProjectDeleteConflictError);

    vi.doUnmock("@/lib/db/supabase");
    vi.resetModules();
  });
});
