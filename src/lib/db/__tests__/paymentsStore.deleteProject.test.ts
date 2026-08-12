import { describe, it, expect } from "vitest";
import {
  createClient as createPaymentsClient,
  createProject,
  getClientById,
  getProjectById,
  listProjects,
  deleteProject,
} from "@/lib/db/paymentsStore";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// paymentsStore.ts transparently uses its in-memory fallback — real (if
// ephemeral) round-trips, same pattern as paymentsStore.deleteClient.test.ts.
// Nunca contra Supabase real (Fase 8B, regla absoluta).

async function makeClient() {
  return createPaymentsClient({
    name: "Cliente de prueba",
    email: `t-${Date.now()}-${Math.random()}@example.com`,
  });
}

describe("deleteProject", () => {
  it("proyecto normal — deleted: true, y ya no es encontrable después", async () => {
    const client = await makeClient();
    const project = await createProject({ clientId: client.id, name: "Proyecto", totalAmount: 1000 });

    const result = await deleteProject(project.id);

    expect(result.deleted).toBe(true);
    expect(await getProjectById(project.id)).toBeNull();
  });

  it("un id inexistente → deleted: false, sin lanzar", async () => {
    const result = await deleteProject("00000000-0000-0000-0000-000000000000");

    expect(result.deleted).toBe(false);
  });

  it("borrar dos veces el mismo proyecto → la segunda vez deleted: false", async () => {
    const client = await makeClient();
    const project = await createProject({ clientId: client.id, name: "Proyecto", totalAmount: 1000 });

    const first = await deleteProject(project.id);
    const second = await deleteProject(project.id);

    expect(first.deleted).toBe(true);
    expect(second.deleted).toBe(false);
  });

  it("el cliente permanece intacto tras borrar su único proyecto", async () => {
    const client = await makeClient();
    const project = await createProject({ clientId: client.id, name: "Proyecto", totalAmount: 1000 });

    await deleteProject(project.id);

    const stillClient = await getClientById(client.id);
    expect(stillClient).not.toBeNull();
    expect(stillClient!.id).toBe(client.id);
  });

  it("otros proyectos del mismo cliente permanecen intactos", async () => {
    const client = await makeClient();
    const toDelete = await createProject({ clientId: client.id, name: "A borrar", totalAmount: 1000 });
    const toKeep = await createProject({ clientId: client.id, name: "Se queda", totalAmount: 2000 });

    await deleteProject(toDelete.id);

    const remaining = await listProjects({ clientId: client.id });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(toKeep.id);
    expect(await getProjectById(toKeep.id)).not.toBeNull();
  });

  it("proyectos de OTROS clientes permanecen intactos", async () => {
    const clientA = await makeClient();
    const clientB = await makeClient();
    const projectA = await createProject({ clientId: clientA.id, name: "A", totalAmount: 1000 });
    const projectB = await createProject({ clientId: clientB.id, name: "B", totalAmount: 1000 });

    await deleteProject(projectA.id);

    expect(await getProjectById(projectB.id)).not.toBeNull();
  });
});
