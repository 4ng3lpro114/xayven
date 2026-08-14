import { describe, it, expect, vi } from "vitest";

/**
 * Isolated in its own file, same reasoning as
 * paymentsStore.deleteProject.supabaseErrors.test.ts: mocking
 * getSupabaseAdmin() to simulate a real Supabase error would otherwise
 * interfere with the real in-memory round-trips exercised by the other
 * paymentsStore test files. Never touches real Supabase — this fakes the
 * client entirely.
 *
 * Regression coverage for the payments-audit fix: createClient/
 * createProject/createPayment must throw when Supabase IS configured but
 * the insert fails — never fabricate an in-memory record in that case (the
 * `!supabase` "not configured at all" branch is untouched and still falls
 * back to memory, covered by the other paymentsStore test files).
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

describe("createClient/createProject/createPayment — error real de Supabase (mockeado)", () => {
  it("createClient: Supabase configurado pero el insert falla → lanza, no crea un cliente en memoria", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/supabase", () => ({
      getSupabaseAdmin: () =>
        makeFakeSupabaseForInsert({
          data: null,
          error: { code: "08006", message: "connection failure" },
        }),
    }));

    const { createClient } = await import("@/lib/db/paymentsStore");

    await expect(createClient({ name: "Ana", email: "ana@example.com" })).rejects.toThrow(
      /createClient failed/
    );

    vi.doUnmock("@/lib/db/supabase");
    vi.resetModules();
  });

  it("createProject: Supabase configurado pero el insert falla → lanza, no crea un proyecto en memoria", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/supabase", () => ({
      getSupabaseAdmin: () =>
        makeFakeSupabaseForInsert({
          data: null,
          error: { code: "08006", message: "connection failure" },
        }),
    }));

    const { createProject } = await import("@/lib/db/paymentsStore");

    await expect(
      createProject({ clientId: "some-client-id", name: "Proyecto", totalAmount: 1000 })
    ).rejects.toThrow(/createProject failed/);

    vi.doUnmock("@/lib/db/supabase");
    vi.resetModules();
  });

  it("createPayment: Supabase configurado pero el insert falla → lanza, no crea un pago en memoria", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/supabase", () => ({
      getSupabaseAdmin: () =>
        makeFakeSupabaseForInsert({
          data: null,
          error: { code: "08006", message: "connection failure" },
        }),
    }));

    const { createPayment } = await import("@/lib/db/paymentsStore");

    await expect(
      createPayment({
        projectId: "some-project-id",
        clientId: "some-client-id",
        provider: "WOMPI",
        reference: "XAYVEN-TEST-REF",
        amount: 1000,
        currency: "COP",
        paymentType: "DEPOSIT",
      })
    ).rejects.toThrow(/createPayment failed/);

    vi.doUnmock("@/lib/db/supabase");
    vi.resetModules();
  });

  it("createClient: data null sin error explícito → también lanza (nunca fabrica un cliente)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/supabase", () => ({
      getSupabaseAdmin: () => makeFakeSupabaseForInsert({ data: null, error: null }),
    }));

    const { createClient } = await import("@/lib/db/paymentsStore");

    await expect(createClient({ name: "Ana", email: "ana@example.com" })).rejects.toThrow(
      /createClient failed/
    );

    vi.doUnmock("@/lib/db/supabase");
    vi.resetModules();
  });
});
