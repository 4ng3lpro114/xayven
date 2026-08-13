import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";

/**
 * Isolated in its own file (same reasoning as every other mock-heavy test
 * in this project — see leadStatus.historyFailure.test.ts,
 * conversion.uniqueConflict.test.ts): mocking saveConversation() to throw
 * would otherwise interfere with the real round-trip tests in route.test.ts.
 *
 * Fase 9C follow-up audit: saveConversation() now throws instead of
 * silently "succeeding" when the conversation row is gone (e.g. deleted
 * by an admin in the narrow window between a chat turn's start and its
 * write). This proves the two call sites in the route handle that
 * correctly — one as a controlled failure response, one as a logged,
 * swallowed best-effort write — instead of crashing uncaught.
 */
const completeChatMock = vi.fn();
vi.mock("@/lib/ai/provider", () => ({
  isAIConfigured: () => true,
  completeChat: (...args: unknown[]) => completeChatMock(...args),
}));

const saveConversationMock = vi.fn();
vi.mock("@/lib/db/conversationStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/conversationStore")>();
  return {
    ...actual,
    saveConversation: (...args: Parameters<typeof actual.saveConversation>) =>
      saveConversationMock(...args),
  };
});

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeSessionId(): string {
  return `test-session-${randomBytes(8).toString("hex")}`;
}

describe("POST /api/ai/chat — saveConversation() falla (conversación desaparecida mid-turn)", () => {
  beforeEach(() => {
    completeChatMock.mockReset();
    saveConversationMock.mockReset();
  });

  it("falla en la escritura principal (turno exitoso) → 500 controlado, ok:false, nunca un crash ni un ok:true fantasma", async () => {
    completeChatMock.mockResolvedValue({ ok: true, content: "Hola." });
    saveConversationMock.mockRejectedValue(
      new Error("[conversations] saveConversation failed: not_found some-id")
    );
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest({ sessionId: makeSessionId(), message: "Hola", locale: "es" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("chat_turn_failed");

    // Detectable server-side, never hidden.
    const loggedText = consoleErrorSpy.mock.calls.map((call) => JSON.stringify(call)).join(" ");
    expect(loggedText).toContain("[ai/chat]");
    // Never leaks the raw internal error message to the client.
    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain("saveConversation failed");

    consoleErrorSpy.mockRestore();
  });

  it("falla en el guardado best-effort tras un error del proveedor de IA → la respuesta sigue siendo la del proveedor (502/503), no un crash", async () => {
    completeChatMock.mockResolvedValue({ ok: false, reason: "request_failed", detail: "timeout" });
    saveConversationMock.mockRejectedValue(new Error("conversation deleted mid-turn"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest({ sessionId: makeSessionId(), message: "Hola", locale: "es" }));

    // The AI failure is still the reported reason — the best-effort save
    // failing doesn't change or mask it, and doesn't crash the request.
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("request_failed");

    const loggedText = consoleErrorSpy.mock.calls.map((call) => JSON.stringify(call)).join(" ");
    expect(loggedText).toContain("[ai/chat]");

    consoleErrorSpy.mockRestore();
  });
});
