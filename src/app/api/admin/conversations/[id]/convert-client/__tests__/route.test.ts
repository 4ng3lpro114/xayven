import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { getOrCreateConversation, saveConversation, getConversationById } from "@/lib/db/conversationStore";
import type { Conversation } from "@/lib/db/types";

/**
 * requireAdminSession() reads cookies() from next/headers, which relies on
 * Next's per-request AsyncLocalStorage — unavailable when a route handler
 * is invoked directly (outside a real Next.js request lifecycle), so it
 * must be mocked here regardless of which auth outcome a given test wants.
 * Everything else (convertConversationToClient, the stores) runs for
 * real, against the in-memory fallback — same round-trip philosophy as
 * src/lib/leads/__tests__/conversion.test.ts.
 */
const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";
import * as routeModule from "../route";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/admin/conversations/x/convert-client", {
    method: "POST",
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

describe("POST /api/admin/conversations/[id]/convert-client", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);

    const res = await POST(makeRequest(), makeContext("does-not-matter"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("usuario autorizado + conversación válida → 200, cliente creado", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const conversation = await makeSeededConversation({
      visitorName: "Diego",
      visitorEmail: "diego@email.com",
      visitorPhone: "3111111111",
    });

    const res = await POST(makeRequest(), makeContext(conversation.id));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.client.name).toBe("Diego");
    expect(body.client.email).toBe("diego@email.com");
    expect(body.created).toBe(true);
    expect(body.nameDerivedFromCompany).toBe(false);
  });

  it("segunda llamada sobre la misma conversación → 200, idempotente, created=false, mismo cliente", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const conversation = await makeSeededConversation({
      visitorName: "Elena",
      visitorEmail: "elena@email.com",
    });

    const first = await POST(makeRequest(), makeContext(conversation.id));
    const firstBody = await first.json();

    const second = await POST(makeRequest(), makeContext(conversation.id));
    const secondBody = await second.json();

    expect(second.status).toBe(200);
    expect(secondBody.ok).toBe(true);
    expect(secondBody.created).toBe(false);
    expect(secondBody.client.id).toBe(firstBody.client.id);
  });

  it("segunda llamada a esta ruta (ejecutable dos veces) → solo la primera establece converted_at (Fase 9B)", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const conversation = await makeSeededConversation({
      visitorName: "Gabriela",
      visitorEmail: "gabriela@email.com",
    });

    await POST(makeRequest(), makeContext(conversation.id));
    const afterFirst = await getConversationById(conversation.id);
    expect(afterFirst?.convertedAt).not.toBeNull();

    await POST(makeRequest(), makeContext(conversation.id));
    const afterSecond = await getConversationById(conversation.id);

    expect(afterSecond?.convertedAt).toBe(afterFirst?.convertedAt);
  });

  it("conversación inexistente → 404", async () => {
    requireAdminSessionMock.mockResolvedValue(true);

    const res = await POST(
      makeRequest(),
      makeContext("00000000-0000-0000-0000-000000000000")
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("conversation_not_found");
  });

  it("falta email → error controlado 400", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const conversation = await makeSeededConversation({
      visitorName: "Sin Email",
      visitorEmail: null,
    });

    const res = await POST(makeRequest(), makeContext(conversation.id));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("missing_email");
  });

  it("faltan nombre y company → error controlado 400", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const conversation = await makeSeededConversation({
      visitorName: null,
      company: null,
      visitorEmail: "anonimo2@email.com",
    });

    const res = await POST(makeRequest(), makeContext(conversation.id));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_name_and_company");
  });

  it("solo exporta POST — Next.js rechaza GET/PUT/DELETE/PATCH automáticamente (405) al no existir esos handlers", () => {
    expect("GET" in routeModule).toBe(false);
    expect("PUT" in routeModule).toBe(false);
    expect("DELETE" in routeModule).toBe(false);
    expect("PATCH" in routeModule).toBe(false);
  });
});
