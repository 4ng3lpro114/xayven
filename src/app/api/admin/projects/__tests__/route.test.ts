import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  listClients,
  getProjectById,
  listProjects,
  createClient as createPaymentsClient,
  getClientById,
} from "@/lib/db/paymentsStore";

/**
 * requireAdminSession() reads cookies() from next/headers, unavailable
 * outside a real Next.js request lifecycle — mocked here regardless of
 * outcome, same pattern as every other route test in this project.
 * Everything else is a real round-trip against the in-memory fallback.
 */
const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/projects", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);

    const res = await POST(
      makeRequest({ clientName: "X", clientEmail: "x@example.com", projectName: "P", totalAmount: 1000 })
    );

    expect(res.status).toBe(401);
  });

  it("SIN clientId → comportamiento actual intacto: crea cliente nuevo + proyecto", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const before = await listClients();

    const res = await POST(
      makeRequest({
        clientName: "Cliente Nuevo",
        clientEmail: `nuevo-${Date.now()}@example.com`,
        projectName: "Sitio web",
        totalAmount: 2_000_000,
        currency: "COP",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const after = await listClients();
    expect(after.length).toBe(before.length + 1); // un cliente nuevo, como siempre

    const project = await getProjectById(body.projectId);
    expect(project?.name).toBe("Sitio web");
  });

  it("CON clientId existente → crea el proyecto, usa exactamente ese clientId, NO crea un cliente nuevo", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const client = await createPaymentsClient({
      name: "Cliente Existente",
      email: `existente-${Date.now()}@example.com`,
    });
    const before = await listClients();

    const res = await POST(
      makeRequest({
        clientId: client.id,
        projectName: "Proyecto para cliente existente",
        totalAmount: 3_000_000,
        currency: "COP",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const after = await listClients();
    expect(after.length).toBe(before.length); // NINGÚN cliente nuevo

    const project = await getProjectById(body.projectId);
    expect(project?.clientId).toBe(client.id);
  });

  it("CON clientId de una cuenta XAYVEN sin cliente comercial (isCommercial=false) → crear el proyecto la promueve a isCommercial=true (0012_clients_is_commercial.sql)", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const accountOnlyClient = await createPaymentsClient({
      name: "Solo cuenta",
      email: `solo-cuenta-${Date.now()}@example.com`,
      isCommercial: false,
    });
    expect(accountOnlyClient.isCommercial).toBe(false);

    const res = await POST(
      makeRequest({
        clientId: accountOnlyClient.id,
        projectName: "Proyecto real para cuenta previamente sin cliente",
        totalAmount: 1_500_000,
        currency: "COP",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const reloadedClient = await getClientById(accountOnlyClient.id);
    expect(reloadedClient?.isCommercial).toBe(true);

    const project = await getProjectById(body.projectId);
    expect(project?.clientId).toBe(accountOnlyClient.id);
  });

  it("clientId inexistente → 404, no crea proyecto ni cliente", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const before = await listClients();

    const res = await POST(
      makeRequest({
        clientId: "00000000-0000-0000-0000-000000000000",
        projectName: "Proyecto fantasma",
        totalAmount: 1000,
      })
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("client_not_found");

    const after = await listClients();
    expect(after.length).toBe(before.length);
  });

  it("clientId malformado (no UUID) → error de validación seguro (400), nunca revienta", async () => {
    requireAdminSessionMock.mockResolvedValue(true);

    const res = await POST(
      makeRequest({
        clientId: "esto-no-es-un-uuid",
        projectName: "Proyecto",
        totalAmount: 1000,
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
  });

  it("sin clientId y sin clientName/clientEmail → error de validación (ninguna de las dos formas satisfecha)", async () => {
    requireAdminSessionMock.mockResolvedValue(true);

    const res = await POST(makeRequest({ projectName: "Proyecto", totalAmount: 1000 }));

    expect(res.status).toBe(400);
  });

  describe("Etapa 7 — prueba explícita de no duplicación (fixture aislado, sin tocar Supabase real)", () => {
    it("cliente de prueba 'Angel Rojas': mismo clientId, un solo proyecto, sin segundo 'Angel Rojas' duplicado", async () => {
      requireAdminSessionMock.mockResolvedValue(true);

      const angel = await createPaymentsClient({
        name: "Angel Rojas",
        email: `angel-test-${Date.now()}@example.com`,
      });
      const beforeClients = await listClients();

      const res = await POST(
        makeRequest({
          clientId: angel.id,
          projectName: "Sitio web para Angel",
          totalAmount: 3_000_000,
          currency: "COP",
        })
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      // 1. número de clientes no aumenta
      const afterClients = await listClients();
      expect(afterClients.length).toBe(beforeClients.length);

      // 2. mismo clientId
      const project = await getProjectById(body.projectId);
      expect(project?.clientId).toBe(angel.id);

      // 3. no existe un segundo "Angel Rojas"
      const angelRojasClients = afterClients.filter((c) => c.name === "Angel Rojas");
      expect(angelRojasClients.length).toBe(1);

      // 4. el proyecto aparece al consultar por ese cliente — exactamente
      //    lo que /admin/clients/[id] usa para su sección "Proyectos"
      const projectsForAngel = await listProjects({ clientId: angel.id });
      expect(projectsForAngel.some((p) => p.id === project!.id)).toBe(true);
    });
  });
});
