import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";

/**
 * Isolated in its own file (same reasoning as every other mock-heavy test
 * in this project): mocking changeLeadStatus() to throw a generic failure
 * would otherwise interfere with the real round-trip tests in
 * route.test.ts.
 */
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => Promise.resolve(true),
}));

vi.mock("@/lib/leads/leadStatus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/leads/leadStatus")>();
  return {
    ...actual,
    changeLeadStatus: vi.fn(async () => {
      throw new Error("internal detail that must never reach the client, e.g. a raw Supabase error body");
    }),
  };
});

import { POST } from "../route";
import { getOrCreateConversation } from "@/lib/db/conversationStore";

describe("POST .../conversations/[id]/status — error interno no controlado", () => {
  it("nunca expone el mensaje real ni un stack trace — responde 500 genérico y seguro", async () => {
    const sessionId = `test-session-${randomBytes(8).toString("hex")}`;
    const conversation = await getOrCreateConversation(sessionId, "es");

    const res = await POST(
      new NextRequest("http://localhost/api/admin/conversations/x/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "interested" }),
      }),
      { params: Promise.resolve({ id: conversation.id }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("status_change_failed");

    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain("internal detail");
    expect(bodyText).not.toContain("Supabase");
    expect(bodyText).not.toMatch(/at .*\.ts:\d+/);
  });
});
