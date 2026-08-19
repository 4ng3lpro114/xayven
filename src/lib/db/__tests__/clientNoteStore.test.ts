import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createClientNote, listClientNotes, deleteClientNote } from "@/lib/db/clientNoteStore";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// clientNoteStore.ts transparently uses its in-memory fallback — real (if
// ephemeral) round-trips, same pattern as maintenanceStore.test.ts.

describe("createClientNote / listClientNotes", () => {
  it("una nota creada aparece en el listado de su cliente", async () => {
    const clientId = randomUUID();
    const created = await createClientNote({ clientId, body: "Llamó para preguntar por el estado del proyecto." });

    const notes = await listClientNotes(clientId);
    expect(notes.map((n) => n.id)).toContain(created.id);
    expect(notes.find((n) => n.id === created.id)?.body).toBe(
      "Llamó para preguntar por el estado del proyecto."
    );
  });

  it("nunca mezcla notas de clientes distintos — aislamiento por clientId", async () => {
    const clientA = randomUUID();
    const clientB = randomUUID();
    await createClientNote({ clientId: clientA, body: "Nota de A" });
    await createClientNote({ clientId: clientB, body: "Nota de B" });

    const notesA = await listClientNotes(clientA);
    const notesB = await listClientNotes(clientB);

    expect(notesA.every((n) => n.clientId === clientA)).toBe(true);
    expect(notesA.some((n) => n.body === "Nota de B")).toBe(false);
    expect(notesB.every((n) => n.clientId === clientB)).toBe(true);
    expect(notesB.some((n) => n.body === "Nota de A")).toBe(false);
  });

  it("ordena de más reciente a más antigua", async () => {
    const clientId = randomUUID();
    const first = await createClientNote({ clientId, body: "Primera" });
    const second = await createClientNote({ clientId, body: "Segunda" });

    const notes = await listClientNotes(clientId);
    const indexOfFirst = notes.findIndex((n) => n.id === first.id);
    const indexOfSecond = notes.findIndex((n) => n.id === second.id);
    expect(indexOfSecond).toBeLessThan(indexOfFirst);
  });

  it("un cliente sin notas devuelve un arreglo vacío, nunca lanza", async () => {
    const notes = await listClientNotes(randomUUID());
    expect(notes).toEqual([]);
  });
});

describe("deleteClientNote — filtro doble (id + clientId)", () => {
  it("elimina una nota real de su propio cliente", async () => {
    const clientId = randomUUID();
    const note = await createClientNote({ clientId, body: "Para borrar" });

    const result = await deleteClientNote(note.id, clientId);
    expect(result.deleted).toBe(true);

    const remaining = await listClientNotes(clientId);
    expect(remaining.map((n) => n.id)).not.toContain(note.id);
  });

  it("NUNCA elimina (ni confirma la existencia de) una nota de OTRO cliente — deleted:false", async () => {
    const owner = randomUUID();
    const attacker = randomUUID();
    const note = await createClientNote({ clientId: owner, body: "Nota ajena" });

    const result = await deleteClientNote(note.id, attacker);
    expect(result.deleted).toBe(false);

    // La nota sigue existiendo, intacta, para su dueño real.
    const stillThere = await listClientNotes(owner);
    expect(stillThere.map((n) => n.id)).toContain(note.id);
  });

  it("un id inexistente devuelve deleted:false, nunca lanza", async () => {
    const result = await deleteClientNote(randomUUID(), randomUUID());
    expect(result.deleted).toBe(false);
  });
});
