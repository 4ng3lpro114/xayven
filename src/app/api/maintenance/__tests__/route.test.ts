import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createClient as createPaymentsClient } from "@/lib/db/paymentsStore";
import { listMaintenanceRequests } from "@/lib/db/maintenanceStore";

/**
 * XAYVEN CORE Phase 2 — first test file for POST /api/maintenance.
 * getClientByNormalizedEmail is mocked only so test C (lookup failure) can
 * force a rejection on demand; every other call delegates to the real
 * implementation (real round-trip against the in-memory fallback, same
 * pattern as every other route test in this project — see
 * /api/contact/__tests__/route.test.ts).
 */
// vi.mock factories are hoisted above every top-level statement, including
// regular `const` declarations — vi.hoisted() is the documented way to
// define a variable that's safe to reference inside one (avoids the
// "Cannot access ... before initialization" TDZ error a plain top-level
// `const` would hit here, since this factory calls .mockImplementation()
// eagerly rather than only inside a lazily-invoked closure).
const { getClientByNormalizedEmailMock } = vi.hoisted(() => ({
  getClientByNormalizedEmailMock: vi.fn(),
}));
vi.mock("@/lib/db/paymentsStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/paymentsStore")>();
  getClientByNormalizedEmailMock.mockImplementation(actual.getClientByNormalizedEmail);
  return {
    ...actual,
    getClientByNormalizedEmail: getClientByNormalizedEmailMock,
  };
});

import { POST } from "../route";

let ipCounter = 1;
function uniqueHeaders(): Record<string, string> {
  return { "x-forwarded-for": `203.0.113.${ipCounter++}` };
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/maintenance", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...uniqueHeaders() },
    body: JSON.stringify(body),
  });
}

function makeBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Diana",
    email: `${randomUUID()}@example.com`,
    company: "",
    website: "https://example.com",
    need: "Actualizar contenido",
    priority: "normal",
    message: "Necesito actualizar el contenido de mi sitio.",
    ...overrides,
  };
}

describe("POST /api/maintenance — XAYVEN CORE Phase 2 client linking", () => {
  it("A. email coincide con un cliente existente → client_id correcto", async () => {
    const email = `existing-${randomUUID()}@example.com`;
    const client = await createPaymentsClient({ name: "Cliente Existente", email });

    const res = await POST(makeRequest(makeBody({ email })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const all = await listMaintenanceRequests();
    const created = all.find((r) => r.email === email);
    expect(created).toBeDefined();
    expect(created?.clientId).toBe(client.id);
  });

  it("A2. el match es case/whitespace-insensitive (mismo mecanismo que clients)", async () => {
    const email = `MixedCase-${randomUUID()}@Example.com`;
    const client = await createPaymentsClient({ name: "Cliente Mixed Case", email });

    const res = await POST(makeRequest(makeBody({ email: `  ${email.toUpperCase()}  ` })));
    expect(res.status).toBe(200);

    const all = await listMaintenanceRequests();
    const created = all.find((r) => r.email.trim().toLowerCase() === email.trim().toLowerCase());
    expect(created?.clientId).toBe(client.id);
  });

  it("B. email desconocido → client_id null, la solicitud se crea normalmente", async () => {
    const email = `unknown-${randomUUID()}@example.com`;

    const res = await POST(makeRequest(makeBody({ email })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const all = await listMaintenanceRequests();
    const created = all.find((r) => r.email === email);
    expect(created).toBeDefined();
    expect(created?.clientId).toBeNull();
  });

  it("C. el lookup de cliente falla → la solicitud igual se crea, client_id null", async () => {
    getClientByNormalizedEmailMock.mockRejectedValueOnce(new Error("Supabase boom"));
    const email = `lookup-fails-${randomUUID()}@example.com`;

    const res = await POST(makeRequest(makeBody({ email })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const all = await listMaintenanceRequests();
    const created = all.find((r) => r.email === email);
    expect(created).toBeDefined();
    expect(created?.clientId).toBeNull();
  });

  it("nunca crea un client — solo lo busca (el número de clientes no cambia)", async () => {
    const { listClients } = await import("@/lib/db/paymentsStore");
    const before = await listClients();

    const res = await POST(makeRequest(makeBody({ email: `never-a-client-${randomUUID()}@example.com` })));
    expect(res.status).toBe(200);

    const after = await listClients();
    expect(after.length).toBe(before.length);
  });
});
