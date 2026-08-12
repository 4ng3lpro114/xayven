import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { getOrCreateConversation, saveConversation, getConversationById } from "@/lib/db/conversationStore";
import type { Conversation } from "@/lib/db/types";

/**
 * requireAdminSession() reads cookies() from next/headers, which needs
 * Next's per-request AsyncLocalStorage — unavailable when a route handler
 * is invoked directly outside a real Next.js request lifecycle, so it's
 * mocked here regardless of which auth outcome a given test wants.
 * Everything else is a real round-trip against the in-memory store — same
 * pattern as convert-client/__tests__/route.test.ts.
 */
const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { DELETE } from "../route";
import * as routeModule from "../route";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/admin/conversations/x", { method: "DELETE" });
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function makeSeededConversation(overrides: Partial<Conversation> = {}): Promise<Conversation> {
  const sessionId = `test-session-${randomBytes(8).toString("hex")}`;
  const base = await getOrCreateConversation(sessionId, "es");
  return saveConversation({ ...base, ...overrides });
}

describe("DELETE /api/admin/conversations/[id]", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);

    const res = await DELETE(makeRequest(), makeContext("does-not-matter"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("conversación inexistente → 404", async () => {
    requireAdminSessionMock.mockResolvedValue(true);

    const res = await DELETE(
      makeRequest(),
      makeContext("00000000-0000-0000-0000-000000000000")
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("conversación con client_id vinculado → 409, no se borra", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const conversation = await makeSeededConversation({ clientId: "some-client-id" });

    const res = await DELETE(makeRequest(), makeContext(conversation.id));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("has_linked_client");

    // Never actually deleted — still there afterward.
    expect(await getConversationById(conversation.id)).not.toBeNull();
  });

  it("conversación sin client_id → 200, y realmente desaparece", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const conversation = await makeSeededConversation({ clientId: null });

    const res = await DELETE(makeRequest(), makeContext(conversation.id));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(await getConversationById(conversation.id)).toBeNull();
  });

  it("solo exporta DELETE — Next.js rechaza GET/POST/PUT/PATCH automáticamente (405)", () => {
    expect("GET" in routeModule).toBe(false);
    expect("POST" in routeModule).toBe(false);
    expect("PUT" in routeModule).toBe(false);
    expect("PATCH" in routeModule).toBe(false);
  });
});
