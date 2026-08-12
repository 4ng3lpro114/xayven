import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Isolated in its own file (same reasoning as
 * src/lib/leads/__tests__/conversion.uniqueConflict.test.ts): mocking
 * convertConversationToClient() to throw a generic, non-LeadConversionError
 * failure would otherwise interfere with the real round-trip tests in
 * route.test.ts.
 */
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => Promise.resolve(true),
}));

vi.mock("@/lib/leads/conversion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/leads/conversion")>();
  return {
    ...actual,
    convertConversationToClient: vi.fn(async () => {
      throw new Error(
        "internal detail that must never reach the client, e.g. a raw Supabase/connection string fragment"
      );
    }),
  };
});

import { POST } from "../route";

describe("POST .../convert-client — error interno no controlado", () => {
  it("nunca expone el mensaje real ni un stack trace — responde 500 genérico y seguro", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/admin/conversations/x/convert-client", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "any-id" }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("conversion_failed");

    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain("internal detail");
    expect(bodyText).not.toContain("Supabase");
    expect(bodyText).not.toContain("connection string");
    expect(bodyText).not.toMatch(/at .*\.ts:\d+/); // no stack-trace-shaped content
  });
});
