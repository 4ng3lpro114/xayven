import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Unlike contactRequestStore/paymentsStore, Supabase Auth has no
 * in-memory fallback anywhere in this codebase (there's nothing sensible
 * to fall back to for password auth) — so this mocks
 * @/lib/auth/supabaseServer entirely, at the same boundary
 * contactRequestStore.supabaseErrors.test.ts mocks @/lib/db/supabase.
 * Never touches real Supabase; no test users are ever created anywhere,
 * local or in production.
 */
const isClientAuthConfiguredMock = vi.fn();
const signUpMock = vi.fn();

vi.mock("@/lib/auth/supabaseServer", () => ({
  isClientAuthConfigured: () => isClientAuthConfiguredMock(),
  createSupabaseServerClient: async () => ({
    auth: { signUp: signUpMock },
  }),
}));

import { POST } from "../route";

let ipCounter = 0;

// Cada test usa una IP distinta — el rate limiter es un Map en memoria a
// nivel de módulo (mismo patrón que /api/contact), y esta suite hace más
// llamadas que el límite (5/10min) permitiría desde una sola IP.
function makeRequest(body: unknown): NextRequest {
  ipCounter += 1;
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.0.0.${ipCounter}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    isClientAuthConfiguredMock.mockReset();
    signUpMock.mockReset();
    isClientAuthConfiguredMock.mockReturnValue(true);
  });

  it("no configurado (sin SUPABASE_ANON_KEY) → 503", async () => {
    isClientAuthConfiguredMock.mockReturnValue(false);
    const res = await POST(
      makeRequest({ email: "diana@example.com", password: "supersecret1", confirmPassword: "supersecret1" })
    );
    expect(res.status).toBe(503);
  });

  it("registro válido, confirmaciones desactivadas (sesión inmediata) → 200, sessionActive true", async () => {
    signUpMock.mockResolvedValue({
      data: { user: { id: "u1", email: "diana@example.com" }, session: { access_token: "t" } },
      error: null,
    });

    const res = await POST(
      makeRequest({ email: "diana@example.com", password: "supersecret1", confirmPassword: "supersecret1" })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.sessionActive).toBe(true);
    // Nunca se le pasa role/client_id a Supabase Auth — solo email/password.
    expect(signUpMock).toHaveBeenCalledWith({ email: "diana@example.com", password: "supersecret1" });
  });

  it("registro válido, confirmación de email requerida (sin sesión todavía) → 200, sessionActive false", async () => {
    signUpMock.mockResolvedValue({
      data: { user: { id: "u1", email: "diana@example.com" }, session: null },
      error: null,
    });

    const res = await POST(
      makeRequest({ email: "diana@example.com", password: "supersecret1", confirmPassword: "supersecret1" })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.sessionActive).toBe(false);
  });

  it("contraseñas distintas → 400 passwords_dont_match, nunca llama a Supabase", async () => {
    const res = await POST(
      makeRequest({ email: "diana@example.com", password: "supersecret1", confirmPassword: "otra12345" })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("passwords_dont_match");
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("email inválido → 400 validation_failed, nunca llama a Supabase", async () => {
    const res = await POST(
      makeRequest({ email: "no-es-un-email", password: "supersecret1", confirmPassword: "supersecret1" })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("email ya registrado → 400 email_in_use, sin exponer el mensaje real de Supabase", async () => {
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "User already registered", status: 400 },
    });

    const res = await POST(
      makeRequest({ email: "diana@example.com", password: "supersecret1", confirmPassword: "supersecret1" })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("email_in_use");
    expect(JSON.stringify(body)).not.toContain("already registered");
  });

  it("payload sin role/client_id — el schema no los acepta como campos válidos, se ignoran", async () => {
    signUpMock.mockResolvedValue({
      data: { user: { id: "u1", email: "diana@example.com" }, session: { access_token: "t" } },
      error: null,
    });

    await POST(
      makeRequest({
        email: "diana@example.com",
        password: "supersecret1",
        confirmPassword: "supersecret1",
        role: "admin",
        client_id: "11111111-1111-1111-1111-111111111111",
      })
    );

    // signUp() solo recibe email/password — nada más pudo colarse.
    expect(signUpMock).toHaveBeenCalledWith({ email: "diana@example.com", password: "supersecret1" });
  });
});
