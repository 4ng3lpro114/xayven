import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import {
  getOrCreateConversation,
  getConversationById,
  deleteConversation,
  saveConversation,
  listConversations,
} from "@/lib/db/conversationStore";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// conversationStore.ts transparently uses its in-memory fallback — real
// (if ephemeral) read/write/delete round-trips, not mocks. Same pattern as
// src/lib/leads/__tests__/conversion.test.ts.

async function makeConversation() {
  const sessionId = `test-session-${randomBytes(8).toString("hex")}`;
  return getOrCreateConversation(sessionId, "es");
}

describe("deleteConversation", () => {
  it("borra una conversación existente — deleted: true, y ya no es encontrable después", async () => {
    const conversation = await makeConversation();

    const result = await deleteConversation(conversation.id);

    expect(result.deleted).toBe(true);
    expect(await getConversationById(conversation.id)).toBeNull();
  });

  it("un id inexistente → deleted: false, sin lanzar", async () => {
    const result = await deleteConversation("00000000-0000-0000-0000-000000000000");

    expect(result.deleted).toBe(false);
  });

  it("borrar dos veces la misma conversación → la segunda vez deleted: false", async () => {
    const conversation = await makeConversation();

    const first = await deleteConversation(conversation.id);
    const second = await deleteConversation(conversation.id);

    expect(first.deleted).toBe(true);
    expect(second.deleted).toBe(false);
  });
});

describe("listConversations — filtro por clientId (Fase 5B)", () => {
  it("devuelve solo las conversaciones vinculadas al client_id pedido", async () => {
    const clientId = `client-${randomBytes(6).toString("hex")}`;
    const linked = await saveConversation({ ...(await makeConversation()), clientId });
    await makeConversation(); // otra sin vincular, no debe aparecer

    const result = await listConversations({ clientId });

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(linked.id);
  });

  it("clientId sin ninguna conversación vinculada → arreglo vacío", async () => {
    const result = await listConversations({ clientId: "no-existe-ningun-vinculo" });

    expect(result).toEqual([]);
  });

  it("sin filtro clientId → comportamiento igual que antes (todas, sin romper compatibilidad)", async () => {
    const before = await listConversations({ limit: 1000 });
    await makeConversation();
    const after = await listConversations({ limit: 1000 });

    expect(after.length).toBe(before.length + 1);
  });
});

describe("convertedAt (Fase 9B)", () => {
  it("una conversación nueva empieza con convertedAt: null — nunca inventado", async () => {
    const conversation = await makeConversation();

    expect(conversation.convertedAt).toBeNull();
  });

  it("saveConversation() persiste convertedAt (round-trip completo vía el fallback en memoria)", async () => {
    const conversation = await makeConversation();
    const now = new Date().toISOString();

    const saved = await saveConversation({ ...conversation, convertedAt: now });

    expect(saved.convertedAt).toBe(now);
    const reloaded = await getConversationById(conversation.id);
    expect(reloaded?.convertedAt).toBe(now);
  });

  it("guardar otros campos NO toca convertedAt — sigue null si nunca se estableció explícitamente (compatibilidad con datos antiguos)", async () => {
    const conversation = await makeConversation();

    const saved = await saveConversation({ ...conversation, leadScore: 42 });

    expect(saved.convertedAt).toBeNull();
  });
});
