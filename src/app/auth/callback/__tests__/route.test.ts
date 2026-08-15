import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { SITE_URL } from "@/lib/constants";

/**
 * Same boundary as register/route.test.ts — mocks @/lib/auth/supabaseServer
 * entirely, never touches real Supabase. No test users are created or
 * confirmed anywhere, local or in production.
 */
const exchangeCodeForSessionMock = vi.fn();

vi.mock("@/lib/auth/supabaseServer", () => ({
  createSupabaseServerClient: async () => ({
    auth: { exchangeCodeForSession: exchangeCodeForSessionMock },
  }),
}));

import { GET } from "../route";

function makeRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost/auth/callback${query}`);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSessionMock.mockReset();
  });

  it("sin code → redirect a /es/login?error=confirmation_failed, nunca llama a exchangeCodeForSession", async () => {
    const res = await GET(makeRequest(""));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${SITE_URL}/es/login?error=confirmation_failed`);
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
  });

  it("code válido, sin locale → exchangeCodeForSession() se llama con el code, redirect a /es/account (fallback)", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ data: { session: {} }, error: null });

    const res = await GET(makeRequest("?code=abc123"));

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("abc123");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${SITE_URL}/es/account`);
  });

  it("code válido + locale='es' → redirect a /es/account", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ data: { session: {} }, error: null });

    const res = await GET(makeRequest("?code=abc123&locale=es"));

    expect(res.headers.get("location")).toBe(`${SITE_URL}/es/account`);
  });

  it("code válido + locale='en' → redirect a /en/account", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ data: { session: {} }, error: null });

    const res = await GET(makeRequest("?code=abc123&locale=en"));

    expect(res.headers.get("location")).toBe(`${SITE_URL}/en/account`);
  });

  it("code válido + locale no reconocido → fallback seguro a /es/account, nunca se usa el valor recibido", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ data: { session: {} }, error: null });

    const res = await GET(makeRequest("?code=abc123&locale=fr"));

    expect(res.headers.get("location")).toBe(`${SITE_URL}/es/account`);
  });

  it("code inválido/expirado (exchangeCodeForSession devuelve error) → redirect a /es/login?error=confirmation_failed, sin exponer el error real de Supabase", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({
      data: { session: null },
      error: { message: "invalid or expired flow state, no user found", status: 400 },
    });

    const res = await GET(makeRequest("?code=expired-or-bad"));

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toBe(`${SITE_URL}/es/login?error=confirmation_failed`);
    expect(location).not.toContain("flow state");
  });

  it("no permite un destino externo arbitrario — locale con valor tipo URL nunca aparece en el redirect final", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ data: { session: {} }, error: null });

    const res = await GET(makeRequest("?code=abc123&locale=https://evil.example.com"));

    const location = res.headers.get("location");
    expect(location).toBe(`${SITE_URL}/es/account`);
    expect(location).not.toContain("evil.example.com");
    expect(location?.startsWith(SITE_URL)).toBe(true);
  });
});
