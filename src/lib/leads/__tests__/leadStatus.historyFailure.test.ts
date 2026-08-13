import { describe, it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";

/**
 * Isolated in its own file (same reasoning as every other mock-heavy test
 * in this project): mocking recordLeadStatusChange() to throw would
 * otherwise interfere with the real round-trip tests in leadStatus.test.ts.
 *
 * Fase 9C regla 9: un fallo del INSERT del historial nunca debe fingir
 * éxito, nunca debe revertir el cambio de estado ya aplicado, y debe
 * quedar detectable (server-side log + historyRecorded: false).
 */
vi.mock("@/lib/db/conversationStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/conversationStore")>();
  return {
    ...actual,
    recordLeadStatusChange: vi.fn(async () => {
      throw new Error("internal detail that must never break the caller, e.g. a raw Supabase error body");
    }),
  };
});

import { changeLeadStatus } from "@/lib/leads/leadStatus";
import { getOrCreateConversation, saveConversation, getConversationById } from "@/lib/db/conversationStore";

describe("changeLeadStatus — fallo al registrar el historial", () => {
  it("el estado SÍ cambia, historyRecorded: false, se registra en consola, nunca lanza", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const sessionId = `test-session-${randomBytes(8).toString("hex")}`;
    const base = await getOrCreateConversation(sessionId, "es");
    const conversation = await saveConversation({ ...base, leadStatus: "exploring" });

    const result = await changeLeadStatus({
      conversation,
      newStatus: "interested",
      changedBy: "ai",
      source: "ai_chat_turn",
    });

    expect(result.changed).toBe(true);
    expect(result.historyRecorded).toBe(false);
    expect(result.conversation.leadStatus).toBe("interested");

    // El estado real, persistido, también refleja el cambio — no se revirtió.
    const reloaded = await getConversationById(conversation.id);
    expect(reloaded?.leadStatus).toBe("interested");

    // Detectable en logs — nunca oculto en silencio.
    expect(consoleErrorSpy).toHaveBeenCalled();
    const loggedText = consoleErrorSpy.mock.calls.map((call) => JSON.stringify(call)).join(" ");
    expect(loggedText).toContain("lead_status_history");

    consoleErrorSpy.mockRestore();
  });
});
