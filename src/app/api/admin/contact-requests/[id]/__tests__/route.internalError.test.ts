import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

/**
 * Isolated in its own file — mocking deleteContactRequest() to throw would
 * otherwise interfere with the real round-trip tests in route.test.ts.
 * Same reasoning as conversations/[id]/__tests__/route.internalError.test.ts.
 */
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => Promise.resolve(true),
}));

vi.mock("@/lib/db/contactRequestStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/contactRequestStore")>();
  return {
    ...actual,
    deleteContactRequest: vi.fn(async () => {
      throw new Error("internal detail that must never reach the client, e.g. a raw Supabase error body");
    }),
  };
});

import { DELETE } from "../route";
import { createContactRequest } from "@/lib/db/contactRequestStore";

describe("DELETE .../contact-requests/[id] — error interno no controlado", () => {
  it("nunca expone el mensaje real ni un stack trace — responde 500 genérico y seguro", async () => {
    const created = await createContactRequest({
      name: "Diana",
      email: `${randomUUID()}@example.com`,
      company: null,
      projectType: "Sitio web nuevo",
      budget: "Menos de $1.000.000 COP",
      message: "Necesito ayuda con mi proyecto.",
    });

    const res = await DELETE(
      new NextRequest("http://localhost/api/admin/contact-requests/x", { method: "DELETE" }),
      { params: Promise.resolve({ id: created.id }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("delete_failed");

    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain("internal detail");
    expect(bodyText).not.toContain("Supabase");
    expect(bodyText).not.toMatch(/at .*\.ts:\d+/);
  });
});
