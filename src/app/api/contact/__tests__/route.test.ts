import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { listContactRequests } from "@/lib/db/contactRequestStore";
import { POST } from "../route";

const ORIGINAL_ENV = { ...process.env };

function makeRequest(body: Record<string, unknown>, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Diana",
    email: `diana-${Date.now()}-${Math.random()}@example.com`,
    company: "Aguacates",
    projectType: "Sitio web nuevo",
    budget: "Menos de $1.000.000 COP",
    message: "Necesito un sitio web nuevo para mi negocio de aguacates.",
    website: "", // honeypot, empty = real user
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("POST /api/contact", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.CONTACT_EMAIL_TO;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("D. validación inválida (mensaje demasiado corto) → 400, nada se persiste", async () => {
    const res = await POST(makeRequest(makePayload({ message: "corto" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("validation_failed");
  });

  it("honeypot relleno → 200 sin persistir (comportamiento anti-spam sin cambios)", async () => {
    const payload = makePayload({ website: "http://bot.example" });
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(200);
    const all = await listContactRequests();
    expect(all.some((r) => r.email === payload.email)).toBe(false);
  });

  it("A. envío válido, RESEND_API_KEY+CONTACT_EMAIL_TO no configurados → persisted:true, emailSent:false, y la solicitud queda guardada", async () => {
    const payload = makePayload();
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, persisted: true, emailSent: false });

    const all = await listContactRequests();
    const saved = all.find((r) => r.email === payload.email);
    expect(saved).toBeDefined();
    expect(saved?.status).toBe("new");
    expect(saved?.name).toBe(payload.name);
    expect(saved?.message).toBe(payload.message);
  });

  it("A2. envío válido, Resend responde éxito → persisted:true, emailSent:true", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.CONTACT_EMAIL_TO = "admin@example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ id: "email-id-123" }))
    );

    const payload = makePayload();
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, persisted: true, emailSent: true });

    const all = await listContactRequests();
    expect(all.some((r) => r.email === payload.email)).toBe(true);
  });

  it("B. envío válido, Resend responde error → la solicitud sigue guardada, emailSent:false", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.CONTACT_EMAIL_TO = "admin@example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "invalid domain" }, 422))
    );

    const payload = makePayload();
    const res = await POST(makeRequest(payload));
    // Never reported as a request-level failure — the request was already
    // persisted before Resend was ever called.
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, persisted: true, emailSent: false });

    const all = await listContactRequests();
    const saved = all.find((r) => r.email === payload.email);
    expect(saved).toBeDefined();
    expect(saved?.status).toBe("new");
  });

  it("B2. Resend lanza una excepción de red → la solicitud sigue guardada, emailSent:false", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.CONTACT_EMAIL_TO = "admin@example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    const payload = makePayload();
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, persisted: true, emailSent: false });

    const all = await listContactRequests();
    expect(all.some((r) => r.email === payload.email)).toBe(true);
  });

  it("E. excede el rate limit → 429, sin importar cuántas veces se reintente después", async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 254) + 1}`; // fresh bucket per test run
    let lastRes: Response | undefined;
    for (let i = 0; i < 11; i++) {
      lastRes = await POST(makeRequest(makePayload(), { "x-forwarded-for": ip }));
    }
    expect(lastRes?.status).toBe(429);
    expect((await lastRes!.json()).error).toBe("rate_limited");
  });
});

describe("POST /api/contact — C. la persistencia falla (mockeado)", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/db/contactRequestStore");
    vi.resetModules();
  });

  it("createContactRequest lanza → 500 persist_failed, nunca se afirma éxito, nunca se llama a Resend", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/contactRequestStore", () => ({
      createContactRequest: vi.fn(async () => {
        throw new Error("connection failure");
      }),
    }));

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    process.env.RESEND_API_KEY = "test-key";
    process.env.CONTACT_EMAIL_TO = "admin@example.com";

    const { POST: PostWithMockedStore } = await import("../route");
    const res = await PostWithMockedStore(makeRequest(makePayload()));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("persist_failed");
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.CONTACT_EMAIL_TO;
  });
});
