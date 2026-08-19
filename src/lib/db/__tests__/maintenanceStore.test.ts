import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createMaintenanceRequest,
  listMaintenanceRequests,
  getMaintenanceRequestById,
} from "@/lib/db/maintenanceStore";

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

describe("XAYVEN CORE Phase 2 — client_id", () => {
  it("D. registros existentes (creados sin clientId, como antes de esta fase) preservan todos sus campos y quedan con clientId null", async () => {
    const email = `${randomUUID()}@example.com`;
    const created = await createMaintenanceRequest({
      name: "Ana Histórica",
      email,
      company: "Aguacates",
      website: "https://example.com",
      need: "Actualizar el sitio",
      priority: "normal",
      message: "Necesito ayuda",
      // clientId deliberadamente omitido — simula una solicitud creada
      // antes de que este campo existiera, o cualquier llamador que no lo
      // pase.
    });

    expect(created.clientId).toBeNull();
    expect(created.name).toBe("Ana Histórica");
    expect(created.email).toBe(email);
    expect(created.company).toBe("Aguacates");
    expect(created.website).toBe("https://example.com");
    expect(created.need).toBe("Actualizar el sitio");
    expect(created.priority).toBe("normal");
    expect(created.message).toBe("Necesito ayuda");
    expect(created.status).toBe("new");

    const fetched = await getMaintenanceRequestById(created.id);
    expect(fetched).toEqual(created);
  });

  it("con clientId explícito → se persiste y se lee exacto", async () => {
    const clientId = randomUUID();
    const created = await createMaintenanceRequest({
      name: "Bruno",
      email: `${randomUUID()}@example.com`,
      company: null,
      website: "https://example.com",
      need: "Migrar hosting",
      priority: "alta",
      message: "Necesito migrar mi sitio.",
      clientId,
    });

    expect(created.clientId).toBe(clientId);

    const fetched = await getMaintenanceRequestById(created.id);
    expect(fetched?.clientId).toBe(clientId);
  });

  it("E. filtrar el listado por clientId (el mismo mecanismo que /admin/clients/[id] usa) encuentra exactamente las solicitudes vinculadas a ese cliente", async () => {
    const clientId = randomUUID();
    const otherClientId = randomUUID();

    const linked = await createMaintenanceRequest({
      name: "Vinculada",
      email: `${randomUUID()}@example.com`,
      company: null,
      website: "https://example.com",
      need: "Soporte",
      priority: "normal",
      message: "Mensaje de prueba",
      clientId,
    });
    await createMaintenanceRequest({
      name: "De otro cliente",
      email: `${randomUUID()}@example.com`,
      company: null,
      website: "https://example.com",
      need: "Soporte",
      priority: "normal",
      message: "Mensaje de prueba",
      clientId: otherClientId,
    });
    await createMaintenanceRequest({
      name: "Sin vincular",
      email: `${randomUUID()}@example.com`,
      company: null,
      website: "https://example.com",
      need: "Soporte",
      priority: "normal",
      message: "Mensaje de prueba",
      // sin clientId → null
    });

    const all = await listMaintenanceRequests({ limit: 1000 });
    const forThisClient = all.filter((r) => r.clientId === clientId);

    expect(forThisClient).toHaveLength(1);
    expect(forThisClient[0]!.id).toBe(linked.id);
  });

  it("getMaintenanceRequestById devuelve null para un id inexistente", async () => {
    const result = await getMaintenanceRequestById("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });
});
