import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Isolated in its own file (same reasoning as every other internalError
 * test in this project): mocking createProject() to throw a generic
 * failure would otherwise interfere with the real round-trip tests in
 * route.test.ts.
 */
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => Promise.resolve(true),
}));

vi.mock("@/lib/db/paymentsStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/paymentsStore")>();
  return {
    ...actual,
    createProject: vi.fn(async () => {
      throw new Error("internal detail that must never reach the client, e.g. a raw Supabase error body");
    }),
  };
});

import { POST } from "../route";

describe("POST /api/admin/projects — error interno no controlado", () => {
  it("nunca expone el mensaje real ni un stack trace — responde 500 genérico y seguro", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/admin/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: "Cliente X",
          clientEmail: "x@example.com",
          projectName: "Proyecto de prueba",
          totalAmount: 1000,
        }),
      })
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("creation_failed");

    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain("internal detail");
    expect(bodyText).not.toContain("Supabase");
    expect(bodyText).not.toMatch(/at .*\.ts:\d+/);
  });
});
