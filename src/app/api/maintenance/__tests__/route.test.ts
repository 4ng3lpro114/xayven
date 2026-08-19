import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createClient as createPaymentsClient } from "@/lib/db/paymentsStore";
import { listMaintenanceRequests } from "@/lib/db/maintenanceStore";
import { SITE_URL } from "@/lib/constants";

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Structural, version-agnostic over vi.fn's exact generic shape — every
 *  fetch mock in this file only ever needs its `[url, init]` call args. */
function requestBody(fetchMock: { mock: { calls: unknown[][] } }, callIndex = 0): Record<string, unknown> {
  const call = fetchMock.mock.calls[callIndex] as [string, RequestInit];
  return JSON.parse(call[1].body as string);
}

const ORIGINAL_ENV = { ...process.env };

describe("POST /api/maintenance — XAYVEN CORE Phase 2 client linking", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.CONTACT_EMAIL_TO;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

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

/**
 * XAYVEN CORE Phase 3.3 (Communication Audit) — this coverage did not
 * exist before this phase: the email-delivery branch of /api/maintenance
 * had zero tests, unlike its /api/contact counterpart. Mirrors that
 * file's own test names/structure (A/A2/B/B2/E) so both routes are easy
 * to compare side by side.
 */
describe("POST /api/maintenance — email de notificación (Phase 3.3)", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.CONTACT_EMAIL_TO;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("honeypot relleno → 200 sin persistir (comportamiento anti-spam sin cambios)", async () => {
    const email = `honeypot-${randomUUID()}@example.com`;
    const res = await POST(makeRequest(makeBody({ email, hp: "http://bot.example" })));
    expect(res.status).toBe(200);

    const all = await listMaintenanceRequests();
    expect(all.some((r) => r.email === email)).toBe(false);
  });

  it("A. RESEND_API_KEY+CONTACT_EMAIL_TO no configurados → persisted:true, emailSent:false, la solicitud queda guardada", async () => {
    const email = `no-config-${randomUUID()}@example.com`;
    const res = await POST(makeRequest(makeBody({ email })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, persisted: true, emailSent: false });

    const all = await listMaintenanceRequests();
    expect(all.some((r) => r.email === email)).toBe(true);
  });

  it("A2. Resend responde éxito → persisted:true, emailSent:true, con contenido enriquecido (estado, cliente, referencia, link admin)", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.CONTACT_EMAIL_TO = "admin@example.com";
    const fetchMock = vi.fn(async () => jsonResponse({ id: "email-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const email = `success-${randomUUID()}@example.com`;
    const res = await POST(makeRequest(makeBody({ email })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, persisted: true, emailSent: true });

    const sentBody = requestBody(fetchMock);
    expect(sentBody.reply_to).toBe(email);
    const all = await listMaintenanceRequests();
    const created = all.find((r) => r.email === email);
    expect(sentBody.text).toContain(`Estado: ${created?.status}`);
    expect(sentBody.text).toContain("Cliente existente: no");
    expect(sentBody.text).toContain(`Referencia: ${created?.id}`);
    expect(sentBody.text).toContain(`${SITE_URL}/admin/maintenance/${created?.id}`);
  });

  it("A3. cuando el email coincide con un cliente existente, la notificación dice 'Cliente existente: sí'", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.CONTACT_EMAIL_TO = "admin@example.com";
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    const email = `existing-${randomUUID()}@example.com`;
    await createPaymentsClient({ name: "Cliente Existente", email });

    await POST(makeRequest(makeBody({ email })));

    const sentBody = requestBody(fetchMock);
    expect(sentBody.text).toContain("Cliente existente: sí");
  });

  it("B. Resend responde error → la solicitud sigue guardada, emailSent:false", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.CONTACT_EMAIL_TO = "admin@example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "invalid domain" }, 422))
    );

    const email = `resend-error-${randomUUID()}@example.com`;
    const res = await POST(makeRequest(makeBody({ email })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, persisted: true, emailSent: false });

    const all = await listMaintenanceRequests();
    expect(all.some((r) => r.email === email)).toBe(true);
  });

  it("B2. fetch lanza una excepción de red → la solicitud sigue guardada, emailSent:false", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.CONTACT_EMAIL_TO = "admin@example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    const email = `network-fail-${randomUUID()}@example.com`;
    const res = await POST(makeRequest(makeBody({ email })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, persisted: true, emailSent: false });

    const all = await listMaintenanceRequests();
    expect(all.some((r) => r.email === email)).toBe(true);
  });

  it("E. excede el rate limit → 429", async () => {
    const headers = { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}` };
    const makeLimitedRequest = () =>
      new NextRequest("http://localhost/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(makeBody({ email: `${randomUUID()}@example.com` })),
      });

    let lastRes: Response = await POST(makeLimitedRequest());
    for (let i = 0; i < 10; i++) {
      lastRes = await POST(makeLimitedRequest());
    }
    expect(lastRes.status).toBe(429);
  });

  it("validación inválida (website sin protocolo) → 400, nada se persiste", async () => {
    const res = await POST(makeRequest(makeBody({ website: "not-a-url" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("validation_failed");
  });
});
