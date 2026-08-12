import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Isolated in its own file (same reasoning as route.internalError.test.ts):
 * mocking deleteClient() to throw would otherwise interfere with the real
 * round-trip tests in route.test.ts.
 *
 * Fase 5C-fix (auditoría de eliminación de proyectos): covers the safety
 * net for the rare case where classifyClientImportance() said deletion
 * was safe (client had zero projects/payments at check time) but the
 * real Supabase DELETE is rejected anyway by the `ON DELETE RESTRICT` FK
 * — e.g. a project created for this client in the tiny window between
 * that check and the DELETE call. This must map to a controlled 409, and
 * must NEVER leak the raw Postgres constraint/message to the client.
 */
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => Promise.resolve(true),
}));

vi.mock("@/lib/db/paymentsStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/paymentsStore")>();
  return {
    ...actual,
    deleteClient: vi.fn(async () => {
      throw new actual.ClientDeleteConflictError(
        "23503",
        "internal detail that must never reach the client, e.g. a raw Postgres constraint name"
      );
    }),
  };
});

import { DELETE } from "../route";
import { createClient as createPaymentsClient } from "@/lib/db/paymentsStore";

describe("DELETE .../clients/[id] — violación de FK real (23503) no detectada por la comprobación previa", () => {
  it("responde 409 has_related_projects (nunca 500), y nunca expone el detalle interno de Postgres", async () => {
    const client = await createPaymentsClient({
      name: "Cliente de prueba",
      email: `t-${Date.now()}-${Math.random()}@example.com`,
    });

    const res = await DELETE(
      new NextRequest("http://localhost/api/admin/clients/x", { method: "DELETE" }),
      { params: Promise.resolve({ id: client.id }) }
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("has_related_projects");

    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain("internal detail");
    expect(bodyText).not.toContain("Postgres");
    expect(bodyText).not.toContain("23503");
    expect(bodyText).not.toMatch(/at .*\.ts:\d+/);
  });
});
