import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const isClientAuthConfiguredMock = vi.fn();
const signInWithPasswordMock = vi.fn();

vi.mock("@/lib/auth/supabaseServer", () => ({
  isClientAuthConfigured: () => isClientAuthConfiguredMock(),
  createSupabaseServerClient: async () => ({
    auth: { signInWithPassword: signInWithPasswordMock },
  }),
}));

import { POST } from "../route";

let ipCounter = 0;
function makeRequest(body: unknown): NextRequest {
  ipCounter += 1;
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.1.${ipCounter}` },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    isClientAuthConfiguredMock.mockReset();
    signInWithPasswordMock.mockReset();
    isClientAuthConfiguredMock.mockReturnValue(true);
  });

  it("no configurado → 503", async () => {
    isClientAuthConfiguredMock.mockReturnValue(false);
    const res = await POST(makeRequest({ email: "diana@example.com", password: "correcta" }));
    expect(res.status).toBe(503);
  });

  it("login válido → 200, ok:true, crea sesión", async () => {
    signInWithPasswordMock.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });

    const res = await POST(makeRequest({ email: "diana@example.com", password: "correcta" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "diana@example.com",
      password: "correcta",
    });
  });

  it("login inválido → 401 invalid_credentials, sin revelar si fue el email o la contraseña", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid login credentials", status: 400 },
    });

    const res = await POST(makeRequest({ email: "diana@example.com", password: "incorrecta" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("invalid_credentials");
    expect(JSON.stringify(body)).not.toContain("Invalid login credentials");
  });

  it("email inválido → 400 validation_failed, nunca llama a Supabase", async () => {
    const res = await POST(makeRequest({ email: "no-es-un-email", password: "x" }));

    expect(res.status).toBe(400);
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });
});

/**
 * Confirma que el límite de login (8/10min) permanece exactamente igual
 * tras el cambio de límite de /api/auth/register a 15/10min — bucket y
 * clave distintos (auth-login:ip:* vs auth-register:ip:*), sin relación
 * entre ambos. IP fija y exclusiva de este bloque (rango de
 * documentación RFC 5737, nunca usado por ipCounter arriba) para poder
 * ejercer el límite real dentro de un mismo test.
 */
describe("rate limiting de /api/auth/login — no debe cambiar", () => {
  beforeEach(() => {
    isClientAuthConfiguredMock.mockReset();
    signInWithPasswordMock.mockReset();
    isClientAuthConfiguredMock.mockReturnValue(true);
    signInWithPasswordMock.mockResolvedValue({
      data: { session: { access_token: "t" } },
      error: null,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function fixedIpLoginRequest(): NextRequest {
    return new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.199" },
      body: JSON.stringify({ email: "rl-login@example.com", password: "correcta" }),
    });
  }

  it("permite exactamente 8 requests y bloquea el 9º con 429 — límite intacto", async () => {
    for (let i = 0; i < 8; i++) {
      const res = await POST(fixedIpLoginRequest());
      expect(res.status).toBe(200);
    }

    const blocked = await POST(fixedIpLoginRequest());
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.error).toBe("rate_limited");
  });
});
