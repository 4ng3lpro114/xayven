import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Isolated test for the one scenario the in-memory fallback structurally
 * cannot exercise: a real Postgres unique-constraint violation (23505) on
 * clients_email_normalized_unique_idx (supabase/migrations/0003_lead_to_client.sql).
 * In-memory mode has no constraint to race against, so this mocks
 * @/lib/db/supabase directly — kept in its own file (rather than mixed
 * into conversion.test.ts) so this module-level mock never affects the
 * real in-memory round-trip tests there.
 */

const insertMock = vi.fn();
const ilikeMaybeSingleMock = vi.fn();

vi.mock("@/lib/db/supabase", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from() {
      return {
        insert() {
          return { select: () => ({ single: insertMock }) };
        },
        select() {
          return { ilike: () => ({ maybeSingle: ilikeMaybeSingleMock }) };
        },
      };
    },
  })),
  isDatabaseConfigured: vi.fn(() => true),
}));

describe("createClientOrGetExisting — race condition (real 23505 recovery)", () => {
  beforeEach(() => {
    insertMock.mockReset();
    ilikeMaybeSingleMock.mockReset();
  });

  it("insert fails with 23505 → recovers the client that won the race instead of duplicating", async () => {
    const { createClientOrGetExisting } = await import("@/lib/db/paymentsStore");

    insertMock.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    ilikeMaybeSingleMock.mockResolvedValue({
      data: {
        id: "existing-client-id",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        name: "Cliente Existente",
        email: "carrera@email.com",
        phone: null,
      },
      error: null,
    });

    const result = await createClientOrGetExisting({
      name: "Cliente Nuevo Intentado",
      email: "carrera@email.com",
    });

    expect(result.created).toBe(false);
    expect(result.client.id).toBe("existing-client-id");
    // Never the fabricated draft's name — the recovered real row wins.
    expect(result.client.name).toBe("Cliente Existente");
  });

  it("un error real (no 23505) NO se oculta — se propaga en vez de fabricar un cliente en memoria", async () => {
    const { createClientOrGetExisting } = await import("@/lib/db/paymentsStore");

    insertMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });

    await expect(
      createClientOrGetExisting({ name: "X", email: "x@email.com" })
    ).rejects.toThrow(/42501/);
  });

  it("insert exitoso (sin conflicto) → created: true, sin llamar al fallback de búsqueda", async () => {
    const { createClientOrGetExisting } = await import("@/lib/db/paymentsStore");

    insertMock.mockResolvedValue({
      data: {
        id: "brand-new-id",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        name: "Nuevo",
        email: "nuevo@email.com",
        phone: null,
      },
      error: null,
    });

    const result = await createClientOrGetExisting({ name: "Nuevo", email: "nuevo@email.com" });

    expect(result.created).toBe(true);
    expect(result.client.id).toBe("brand-new-id");
    expect(ilikeMaybeSingleMock).not.toHaveBeenCalled();
  });
});
