import { describe, it, expect, vi } from "vitest";

/**
 * Isolated in its own file — same reasoning as
 * paymentsStore.createSupabaseErrors.test.ts: mocking getSupabaseAdmin()
 * to simulate a real Supabase error would otherwise interfere with the
 * real in-memory round-trips exercised by contactRequestStore.test.ts.
 * Never touches real Supabase — this fakes the client entirely.
 *
 * Regression coverage for the explicit design decision in this store:
 * unlike maintenanceStore.ts (which falls back to memory on a Supabase
 * write error), createContactRequest() must THROW when Supabase is
 * configured but the insert fails — the route depends on this to respond
 * honestly instead of telling the visitor their request was received when
 * it wasn't.
 */
function makeFakeSupabaseForInsert(result: { data: unknown; error: { code?: string; message?: string } | null }) {
  return {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => result,
        }),
      }),
    }),
  };
}

describe("createContactRequest — error real de Supabase (mockeado)", () => {
  it("Supabase configurado pero el insert falla → lanza, no crea una solicitud en memoria", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/supabase", () => ({
      getSupabaseAdmin: () =>
        makeFakeSupabaseForInsert({ data: null, error: { code: "08006", message: "connection failure" } }),
    }));

    const { createContactRequest } = await import("@/lib/db/contactRequestStore");

    await expect(
      createContactRequest({
        name: "Diana",
        email: "diana@example.com",
        company: null,
        projectType: "Sitio web nuevo",
        budget: "Menos de $1.000.000 COP",
        message: "Necesito ayuda con mi proyecto.",
      })
    ).rejects.toThrow(/createContactRequest failed/);

    vi.doUnmock("@/lib/db/supabase");
    vi.resetModules();
  });

  it("data null sin error explícito → también lanza (nunca fabrica una solicitud)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/supabase", () => ({
      getSupabaseAdmin: () => makeFakeSupabaseForInsert({ data: null, error: null }),
    }));

    const { createContactRequest } = await import("@/lib/db/contactRequestStore");

    await expect(
      createContactRequest({
        name: "Diana",
        email: "diana@example.com",
        company: null,
        projectType: "Sitio web nuevo",
        budget: "Menos de $1.000.000 COP",
        message: "Necesito ayuda con mi proyecto.",
      })
    ).rejects.toThrow(/createContactRequest failed/);

    vi.doUnmock("@/lib/db/supabase");
    vi.resetModules();
  });
});

function makeFakeSupabaseForDelete(result: { error: { code?: string; message?: string } | null }) {
  return {
    from: () => ({
      delete: () => ({
        eq: async () => result,
      }),
    }),
  };
}

describe("deleteContactRequest — error real de Supabase (mockeado)", () => {
  it("Supabase configurado pero el delete falla → lanza, nunca finge éxito", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/supabase", () => ({
      getSupabaseAdmin: () =>
        makeFakeSupabaseForDelete({ error: { code: "08006", message: "connection failure" } }),
    }));

    const { deleteContactRequest } = await import("@/lib/db/contactRequestStore");

    await expect(deleteContactRequest("00000000-0000-0000-0000-000000000000")).rejects.toThrow(
      /deleteContactRequest failed/
    );

    vi.doUnmock("@/lib/db/supabase");
    vi.resetModules();
  });
});
