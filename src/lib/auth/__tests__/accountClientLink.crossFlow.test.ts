import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Proves "Solicitud → Cliente ← Cuenta" converge on the same `clients`
 * row without duplicating it — WITHOUT mocking paymentsStore.ts itself
 * (unlike accountClientLink.test.ts, which mocks it for isolated unit
 * coverage). Here getClientByNormalizedEmail()/createClientOrGetExisting()
 * run for real, against a fake Supabase client that faithfully simulates
 * the one thing that actually guarantees no duplicates in production: the
 * `clients_email_normalized_unique_idx` unique constraint (23505 on a
 * second insert for the same normalized email) — see
 * supabase/migrations/0003_lead_to_client.sql.
 *
 * contactRequestConversion.ts is deliberately NOT imported or modified —
 * per the authorized design, this test simulates its exact effect (it
 * calls createClientOrGetExisting() with the same shape) rather than
 * standing up its full contact_requests dependency chain, which would add
 * mocking noise without strengthening this specific guarantee.
 *
 * 0012_clients_is_commercial.sql note: the simulated
 * createClientOrGetExisting() call below does NOT include
 * contactRequestConversion.ts's own promotion step (markClientAsCommercial
 * when it reuses a found client that was account-only) — that would defeat
 * the "simulate the shape, not the full flow" scope of this file. That
 * exact scenario (account registers first, is_commercial=false, THEN a
 * contact request converts for the same email) is covered for real,
 * against the real convertContactRequestToClient(), in
 * contactRequestConversion.test.ts's "is_commercial" describe block —
 * this file only asserts what its own simulated call actually does.
 *
 * Only profilesStore.setProfileClientId() is mocked — irrelevant to what
 * this file proves (client deduplication), and it has its own dedicated
 * coverage in profilesStore.test.ts.
 */
const setProfileClientIdMock = vi.fn();

vi.mock("@/lib/db/profilesStore", () => ({
  setProfileClientId: (...args: unknown[]) => setProfileClientIdMock(...args),
}));

interface FakeRow {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  is_commercial: boolean;
}

function makeFakeClientsTable() {
  const rows: FakeRow[] = [];

  return {
    from(table: string) {
      if (table !== "clients") throw new Error(`unexpected table: ${table}`);
      return {
        insert(row: {
          id: string;
          name: string;
          email: string;
          phone?: string | null;
          company?: string | null;
          is_commercial?: boolean;
        }) {
          return {
            select() {
              return {
                async single() {
                  const normalized = row.email.trim().toLowerCase();
                  const conflict = rows.some((r) => r.email.trim().toLowerCase() === normalized);
                  if (conflict) {
                    return {
                      data: null,
                      error: { code: "23505", message: "duplicate key value violates unique constraint" },
                    };
                  }
                  const stored: FakeRow = {
                    id: row.id,
                    created_at: "2026-01-01T00:00:00.000Z",
                    updated_at: "2026-01-01T00:00:00.000Z",
                    name: row.name,
                    email: row.email,
                    phone: row.phone ?? null,
                    company: row.company ?? null,
                    // Same default as the real Postgres column
                    // (0012_clients_is_commercial.sql) — `true` unless the
                    // caller explicitly asked for `false`.
                    is_commercial: row.is_commercial ?? true,
                  };
                  rows.push(stored);
                  return { data: stored, error: null };
                },
              };
            },
          };
        },
        select() {
          return {
            ilike(_col: string, val: string) {
              return {
                async maybeSingle() {
                  const found = rows.find((r) => r.email.trim().toLowerCase() === val);
                  return { data: found ?? null, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("linkAccountToClient <-> flujo de Solicitud → Cliente — misma primitiva, sin duplicados", () => {
  beforeEach(() => {
    setProfileClientIdMock.mockReset();
    setProfileClientIdMock.mockResolvedValue(undefined);
  });

  it("J. Solicitud ya convertida en client + registro posterior con el mismo email → reutiliza el client existente", async () => {
    vi.resetModules();
    const fakeSupabase = makeFakeClientsTable();
    vi.doMock("@/lib/db/supabase", () => ({ getSupabaseAdmin: () => fakeSupabase }));

    const { createClientOrGetExisting, getClientByNormalizedEmail } = await import("@/lib/db/paymentsStore");
    const { linkAccountToClient } = await import("../accountClientLink");

    // Simula exactamente lo que contactRequestConversion.ts ya hace hoy
    // cuando el admin convierte una solicitud (misma función, mismos
    // argumentos que ese módulo pasa).
    const { client: fromRequest, created: requestCreated } = await createClientOrGetExisting({
      name: "Nombre de la Solicitud",
      email: "mismo@example.com",
      phone: null,
      company: "ACME",
    });
    expect(requestCreated).toBe(true);
    // createClientOrGetExisting() default — igual que la solicitud real
    // convertida (contactRequestConversion.ts nunca pasa isCommercial).
    expect(fromRequest.isCommercial).toBe(true);

    const result = await linkAccountToClient({
      userId: "user-1",
      fullName: "Nombre de la Cuenta",
      email: "mismo@example.com",
    });

    expect(result.clientId).toBe(fromRequest.id);
    expect(result.clientWasCreated).toBe(false);
    expect(setProfileClientIdMock).toHaveBeenCalledWith("user-1", fromRequest.id);

    // El registro de cuenta reutiliza el client ya comercial SIN
    // degradarlo — linkAccountToClient nunca toca is_commercial en la
    // rama de "client existente".
    const afterAccountLink = await getClientByNormalizedEmail("mismo@example.com");
    expect(afterAccountLink?.isCommercial).toBe(true);

    vi.doUnmock("@/lib/db/supabase");
    vi.resetModules();
  });

  it("K. Registro con cuenta nueva + solicitud posterior con el mismo email → la solicitud reutiliza el client existente", async () => {
    vi.resetModules();
    const fakeSupabase = makeFakeClientsTable();
    vi.doMock("@/lib/db/supabase", () => ({ getSupabaseAdmin: () => fakeSupabase }));

    const { createClientOrGetExisting, getClientByNormalizedEmail } = await import("@/lib/db/paymentsStore");
    const { linkAccountToClient } = await import("../accountClientLink");

    const fromAccount = await linkAccountToClient({
      userId: "user-1",
      fullName: "Nombre de la Cuenta",
      email: "mismo@example.com",
    });
    expect(fromAccount.clientWasCreated).toBe(true);

    // El client recién creado por el registro es_commercial=false —
    // linkAccountToClient() lo pasa explícitamente.
    const afterRegister = await getClientByNormalizedEmail("mismo@example.com");
    expect(afterRegister?.isCommercial).toBe(false);

    // Simula exactamente lo que createClientOrGetExisting() hace dentro de
    // contactRequestConversion.ts al convertir una solicitud posterior con
    // el mismo email — MISMO client, sin duplicar. La promoción real a
    // isCommercial=true que contactRequestConversion.ts hace justo después
    // de esta llamada (porque el client encontrado no era comercial) está
    // fuera del alcance de este archivo — ver el comentario del módulo, y
    // contactRequestConversion.test.ts para la cobertura real de eso.
    const { client: fromRequest, created: requestCreated } = await createClientOrGetExisting({
      name: "Nombre de la Solicitud",
      email: "mismo@example.com",
      phone: null,
      company: "ACME",
    });

    expect(requestCreated).toBe(false);
    expect(fromRequest.id).toBe(fromAccount.clientId);

    vi.doUnmock("@/lib/db/supabase");
    vi.resetModules();
  });
});
