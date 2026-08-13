import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import {
  getOrCreateConversation,
  saveConversation,
  listLeadStatusHistory,
  getConversationById,
} from "@/lib/db/conversationStore";
import type { Conversation } from "@/lib/db/types";

/**
 * Fase 9C: este endpoint no tenía NINGUNA prueba antes de esta fase (ver
 * la auditoría) — es un archivo completamente nuevo, no una actualización.
 * requireAdminSession() se mockea por la misma razón de siempre (necesita
 * el AsyncLocalStorage de un request real de Next.js). Todo lo demás corre
 * de verdad contra el fallback en memoria.
 */
const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/conversations/x/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function makeSeededConversation(overrides: Partial<Conversation> = {}): Promise<Conversation> {
  const sessionId = `test-session-${randomBytes(8).toString("hex")}`;
  const base = await getOrCreateConversation(sessionId, "es");
  return saveConversation({ ...base, ...overrides });
}

describe("POST /api/admin/conversations/[id]/status", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);

    const res = await POST(makeRequest({ status: "interested" }), makeContext("does-not-matter"));

    expect(res.status).toBe(401);
  });

  it("conversación inexistente → 404", async () => {
    requireAdminSessionMock.mockResolvedValue(true);

    const res = await POST(
      makeRequest({ status: "interested" }),
      makeContext("00000000-0000-0000-0000-000000000000")
    );

    expect(res.status).toBe(404);
  });

  it("cuerpo inválido (status fuera del enum) → 400 validation_failed", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const conversation = await makeSeededConversation({ leadStatus: "exploring" });

    const res = await POST(makeRequest({ status: "not_a_real_status" }), makeContext(conversation.id));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
  });

  it("transición real válida (exploring → interested) → 200, changed: true, crea 1 evento", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const conversation = await makeSeededConversation({ leadStatus: "exploring" });

    const res = await POST(makeRequest({ status: "interested" }), makeContext(conversation.id));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.leadStatus).toBe("interested");
    expect(body.changed).toBe(true);
    // Fase 9C audit: historyRecorded must reach the caller, not be dropped.
    expect(body.historyRecorded).toBe(true);

    const history = await listLeadStatusHistory(conversation.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ source: "admin_manual_status_change", changedBy: "admin" });
  });

  it("mismo estado repetido → 200, changed: false, NO crea evento", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const conversation = await makeSeededConversation({ leadStatus: "interested" });

    const res = await POST(makeRequest({ status: "interested" }), makeContext(conversation.id));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.changed).toBe(false);
    expect(await listLeadStatusHistory(conversation.id)).toHaveLength(0);
  });

  it("retroceso (interested → exploring) → permitido, 200", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const conversation = await makeSeededConversation({ leadStatus: "interested" });

    const res = await POST(makeRequest({ status: "exploring" }), makeContext(conversation.id));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.leadStatus).toBe("exploring");
  });

  it("intentar status: 'client' → 409 client_requires_conversion, NUNCA deja leadStatus='client' con clientId null (F)", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const conversation = await makeSeededConversation({ leadStatus: "interested" });

    const res = await POST(makeRequest({ status: "client" }), makeContext(conversation.id));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("client_requires_conversion");

    // El estado real no cambió — la conversación sigue sin cliente vinculado.
    const history = await listLeadStatusHistory(conversation.id);
    expect(history).toHaveLength(0);
    const reloaded = await getConversationById(conversation.id);
    expect(reloaded?.leadStatus).toBe("interested");
    expect(reloaded?.clientId).toBeNull();
  });
});
