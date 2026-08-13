import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { changeLeadStatus, LeadStatusChangeError } from "@/lib/leads/leadStatus";
import {
  getOrCreateConversation,
  saveConversation,
  getConversationById,
  listLeadStatusHistory,
  deleteConversation,
} from "@/lib/db/conversationStore";
import { createClient as createPaymentsClient, deleteClient } from "@/lib/db/paymentsStore";
import type { Conversation } from "@/lib/db/types";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// conversationStore.ts/paymentsStore.ts transparently use their in-memory
// fallback — real (if ephemeral) round-trips, same pattern as
// src/lib/leads/__tests__/conversion.test.ts. Nunca contra Supabase real
// (Fase 9C regla absoluta).

async function makeSeededConversation(overrides: Partial<Conversation> = {}): Promise<Conversation> {
  const sessionId = `test-session-${randomBytes(8).toString("hex")}`;
  const base = await getOrCreateConversation(sessionId, "es");
  return saveConversation({ ...base, ...overrides });
}

describe("changeLeadStatus — transición real (A)", () => {
  it("exploring → interested → 1 evento en el historial, changed: true", async () => {
    const conversation = await makeSeededConversation({ leadStatus: "exploring" });

    const result = await changeLeadStatus({
      conversation,
      newStatus: "interested",
      changedBy: "ai",
      source: "ai_chat_turn",
    });

    expect(result.changed).toBe(true);
    expect(result.historyRecorded).toBe(true);
    expect(result.conversation.leadStatus).toBe("interested");

    const history = await listLeadStatusHistory(conversation.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      conversationId: conversation.id,
      fromStatus: "exploring",
      toStatus: "interested",
      changedBy: "ai",
      source: "ai_chat_turn",
    });
  });
});

describe("changeLeadStatus — mismo estado (B, idempotencia)", () => {
  it("interested → interested → 0 eventos, changed: false, NO se actualiza la conversación", async () => {
    const conversation = await makeSeededConversation({ leadStatus: "interested" });

    const result = await changeLeadStatus({
      conversation,
      newStatus: "interested",
      changedBy: "ai",
      source: "ai_chat_turn",
    });

    expect(result.changed).toBe(false);
    expect(result.historyRecorded).toBe(false);

    const history = await listLeadStatusHistory(conversation.id);
    expect(history).toHaveLength(0);
  });

  it("reintento del mismo cambio (llamar dos veces con el mismo newStatus) → un solo evento total", async () => {
    const conversation = await makeSeededConversation({ leadStatus: "exploring" });

    const first = await changeLeadStatus({
      conversation,
      newStatus: "interested",
      changedBy: "admin",
      source: "admin_manual_status_change",
    });
    const second = await changeLeadStatus({
      conversation: first.conversation,
      newStatus: "interested",
      changedBy: "admin",
      source: "admin_manual_status_change",
    });

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);

    const history = await listLeadStatusHistory(conversation.id);
    expect(history).toHaveLength(1);
  });
});

describe("changeLeadStatus — retroceso (C, sin máquina de estados artificial)", () => {
  it("interested → exploring → se permite, 1 evento", async () => {
    const conversation = await makeSeededConversation({ leadStatus: "interested" });

    const result = await changeLeadStatus({
      conversation,
      newStatus: "exploring",
      changedBy: "admin",
      source: "admin_manual_status_change",
    });

    expect(result.changed).toBe(true);
    expect(result.conversation.leadStatus).toBe("exploring");

    const history = await listLeadStatusHistory(conversation.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStatus: "interested", toStatus: "exploring" });
  });

  it("hot → interested → se permite, 1 evento", async () => {
    const conversation = await makeSeededConversation({ leadStatus: "hot" });

    const result = await changeLeadStatus({
      conversation,
      newStatus: "interested",
      changedBy: "admin",
      source: "admin_manual_status_change",
    });

    expect(result.changed).toBe(true);
    const history = await listLeadStatusHistory(conversation.id);
    expect(history[0]).toMatchObject({ fromStatus: "hot", toStatus: "interested" });
  });

  it("support → interested → se permite, 1 evento", async () => {
    const conversation = await makeSeededConversation({ leadStatus: "support" });

    const result = await changeLeadStatus({
      conversation,
      newStatus: "interested",
      changedBy: "admin",
      source: "admin_manual_status_change",
    });

    expect(result.changed).toBe(true);
    const history = await listLeadStatusHistory(conversation.id);
    expect(history[0]).toMatchObject({ fromStatus: "support", toStatus: "interested" });
  });
});

describe("changeLeadStatus — restricción crítica: 'client' (F, G)", () => {
  it("origen admin_manual_status_change intentando 'client' → rechazado (F)", async () => {
    const conversation = await makeSeededConversation({ leadStatus: "interested" });

    await expect(
      changeLeadStatus({
        conversation,
        newStatus: "client",
        changedBy: "admin",
        source: "admin_manual_status_change",
      })
    ).rejects.toBeInstanceOf(LeadStatusChangeError);

    await expect(
      changeLeadStatus({
        conversation,
        newStatus: "client",
        changedBy: "admin",
        source: "admin_manual_status_change",
      })
    ).rejects.toMatchObject({ code: "client_requires_conversion" });

    // Nada debe haber cambiado — ni el estado ni el historial.
    const reloaded = await getConversationById(conversation.id);
    expect(reloaded?.leadStatus).toBe("interested");
    expect(await listLeadStatusHistory(conversation.id)).toHaveLength(0);
  });

  it("origen ai_chat_turn intentando 'client' → rechazado (G) — nunca la IA puede convertir directamente", async () => {
    const conversation = await makeSeededConversation({ leadStatus: "hot" });

    await expect(
      changeLeadStatus({
        conversation,
        newStatus: "client",
        changedBy: "ai",
        source: "ai_chat_turn",
      })
    ).rejects.toMatchObject({ code: "client_requires_conversion" });

    expect(await listLeadStatusHistory(conversation.id)).toHaveLength(0);
  });

  it("source: 'lead_conversion' → SÍ permitido (el único origen legítimo)", async () => {
    const conversation = await makeSeededConversation({ leadStatus: "interested" });

    const result = await changeLeadStatus({
      conversation,
      newStatus: "client",
      changedBy: "admin",
      source: "lead_conversion",
    });

    expect(result.changed).toBe(true);
    expect(result.conversation.leadStatus).toBe("client");
    const history = await listLeadStatusHistory(conversation.id);
    expect(history[0]).toMatchObject({ toStatus: "client", source: "lead_conversion" });
  });
});

describe("changeLeadStatus — IA hacia estados permitidos (H, I, J)", () => {
  it("IA: exploring → interested crea evento (H)", async () => {
    const conversation = await makeSeededConversation({ leadStatus: "exploring" });
    const result = await changeLeadStatus({
      conversation,
      newStatus: "interested",
      changedBy: "ai",
      source: "ai_chat_turn",
    });
    expect(result.changed).toBe(true);
    expect((await listLeadStatusHistory(conversation.id))[0]?.toStatus).toBe("interested");
  });

  it("IA: interested → hot crea evento (I)", async () => {
    const conversation = await makeSeededConversation({ leadStatus: "interested" });
    const result = await changeLeadStatus({
      conversation,
      newStatus: "hot",
      changedBy: "ai",
      source: "ai_chat_turn",
    });
    expect(result.changed).toBe(true);
    expect((await listLeadStatusHistory(conversation.id))[0]?.toStatus).toBe("hot");
  });

  it("→ support crea evento (J)", async () => {
    const conversation = await makeSeededConversation({ leadStatus: "exploring" });
    const result = await changeLeadStatus({
      conversation,
      newStatus: "support",
      changedBy: "ai",
      source: "ai_chat_turn",
    });
    expect(result.changed).toBe(true);
    expect((await listLeadStatusHistory(conversation.id))[0]?.toStatus).toBe("support");
  });
});

describe("changeLeadStatus — conversación antigua (K)", () => {
  it("una conversación nunca tocada por changeLeadStatus() no tiene ningún evento histórico artificial", async () => {
    const conversation = await makeSeededConversation({ leadStatus: "client", clientId: "some-client-id" });

    // Nunca se llamó a changeLeadStatus() para esta conversación — simula
    // una conversación ya convertida ANTES de que existiera el historial.
    const history = await listLeadStatusHistory(conversation.id);

    expect(history).toEqual([]);
  });
});

describe("changeLeadStatus — cliente eliminado (L)", () => {
  it("el historial sobrevive con client_id: null tras borrar el cliente", async () => {
    const client = await createPaymentsClient({
      name: "Cliente de prueba",
      email: `t-${Date.now()}-${Math.random()}@example.com`,
    });
    // Simula una conversación ya vinculada a un cliente (post-conversión) —
    // el flujo completo de conversión se prueba por separado en
    // conversion.test.ts; aquí solo interesa el efecto de borrar el cliente
    // sobre las filas de historial ya existentes.
    const conversation = await makeSeededConversation({ leadStatus: "client", clientId: client.id });

    const result = await changeLeadStatus({
      conversation,
      newStatus: "support",
      changedBy: "admin",
      source: "admin_manual_status_change",
    });
    expect(result.changed).toBe(true);

    const beforeDelete = await listLeadStatusHistory(conversation.id);
    expect(beforeDelete).toHaveLength(1);
    expect(beforeDelete[0]!.clientId).toBe(client.id);

    await deleteClient(client.id);

    const afterDelete = await listLeadStatusHistory(conversation.id);
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0]!.clientId).toBeNull();
  });
});

describe("changeLeadStatus — conversación eliminada (M)", () => {
  it("el historial se elimina en cascada al borrar la conversación", async () => {
    const conversation = await makeSeededConversation({ leadStatus: "exploring" });
    await changeLeadStatus({
      conversation,
      newStatus: "interested",
      changedBy: "ai",
      source: "ai_chat_turn",
    });
    expect(await listLeadStatusHistory(conversation.id)).toHaveLength(1);

    await deleteConversation(conversation.id);

    expect(await listLeadStatusHistory(conversation.id)).toEqual([]);
  });
});
