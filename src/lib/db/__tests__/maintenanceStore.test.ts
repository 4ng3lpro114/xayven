import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createMaintenanceRequest, listMaintenanceRequests } from "@/lib/db/maintenanceStore";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// maintenanceStore.ts transparently uses its in-memory fallback — real (if
// ephemeral) round-trips, same pattern as conversationStore.test.ts.
//
// Fase 10 — first time this table is ever listed anywhere in the codebase
// (see the doc comment on listMaintenanceRequests()).

describe("listMaintenanceRequests (Fase 10 — Analytics V2)", () => {
  it("una solicitud creada aparece en el listado con status 'new' por defecto", async () => {
    const email = `${randomUUID()}@example.com`;
    await createMaintenanceRequest({
      name: "Ana",
      email,
      company: null,
      website: "https://example.com",
      need: "Actualizar el sitio",
      priority: "normal",
      message: "Necesito ayuda",
    });

    const all = await listMaintenanceRequests();
    const mine = all.find((r) => r.email === email);
    expect(mine).toBeDefined();
    expect(mine?.status).toBe("new");
  });

  it("respeta el límite pasado", async () => {
    const limited = await listMaintenanceRequests({ limit: 0 });
    expect(limited).toHaveLength(0);
  });

  it("nunca lanza cuando no hay ninguna solicitud coincidente", async () => {
    const all = await listMaintenanceRequests();
    expect(Array.isArray(all)).toBe(true);
  });
});
