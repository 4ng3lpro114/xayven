import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { SITE_URL } from "@/lib/constants";

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
const linkAccountToClientMock = vi.fn();

vi.mock("@/lib/auth/supabaseServer", () => ({
  isClientAuthConfigured: () => isClientAuthConfiguredMock(),
  createSupabaseServerClient: async () => ({
    auth: { signUp: signUpMock },
  }),
}));

// Client-linking ("Cuenta XAYVEN → Cliente") has its own dedicated
// coverage in accountClientLink.test.ts — here it's mocked at the module
// boundary, same as supabaseServer above, so these tests stay focused on
// route-level behavior: is it called with the right (server-verified)
// arguments, and does its failure stay non-fatal to the HTTP response.
vi.mock("@/lib/auth/accountClientLink", () => ({
  linkAccountToClient: (...args: unknown[]) => linkAccountToClientMock(...args),
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
    linkAccountToClientMock.mockReset();
    isClientAuthConfiguredMock.mockReturnValue(true);
    linkAccountToClientMock.mockResolvedValue({ clientId: "client-1", clientWasCreated: true });
  });

  it("no configurado (sin SUPABASE_ANON_KEY) → 503", async () => {
    isClientAuthConfiguredMock.mockReturnValue(false);
    const res = await POST(
      makeRequest({
        fullName: "Diana Pérez",
        email: "diana@example.com",
        password: "supersecret1",
        confirmPassword: "supersecret1",
      })
    );
    expect(res.status).toBe(503);
  });

  it("registro válido, confirmaciones desactivadas (sesión inmediata) → 200, sessionActive true", async () => {
    signUpMock.mockResolvedValue({
      data: { user: { id: "u1", email: "diana@example.com" }, session: { access_token: "t" } },
      error: null,
    });

    const res = await POST(
      makeRequest({
        fullName: "Diana Pérez",
        email: "diana@example.com",
        password: "supersecret1",
        confirmPassword: "supersecret1",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.sessionActive).toBe(true);
    // full_name viaja únicamente como metadata de Supabase Auth — nunca
    // role/client_id, y nunca se escribe en profiles desde esta ruta. Sin
    // `locale` en el body, cae al default "es".
    expect(signUpMock).toHaveBeenCalledWith({
      email: "diana@example.com",
      password: "supersecret1",
      options: {
        data: { full_name: "Diana Pérez" },
        emailRedirectTo: `${SITE_URL}/auth/callback?locale=es`,
      },
    });
    // "Cuenta XAYVEN → Cliente": se invoca con el id real devuelto por
    // Supabase Auth y los mismos datos ya validados — nunca un client_id
    // proporcionado por el caller (este payload ni siquiera tiene ese campo).
    expect(linkAccountToClientMock).toHaveBeenCalledWith({
      userId: "u1",
      fullName: "Diana Pérez",
      email: "diana@example.com",
    });
  });

  it("registro válido, confirmación de email requerida (sin sesión todavía) → 200, sessionActive false", async () => {
    signUpMock.mockResolvedValue({
      data: { user: { id: "u1", email: "diana@example.com" }, session: null },
      error: null,
    });

    const res = await POST(
      makeRequest({
        fullName: "Diana Pérez",
        email: "diana@example.com",
        password: "supersecret1",
        confirmPassword: "supersecret1",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.sessionActive).toBe(false);
    // La vinculación no depende de que exista sesión activa — solo de que
    // auth.users/profiles ya existan, y ya existen apenas signUp() resuelve.
    expect(linkAccountToClientMock).toHaveBeenCalledWith({
      userId: "u1",
      fullName: "Diana Pérez",
      email: "diana@example.com",
    });
  });

  it("contraseñas distintas → 400 passwords_dont_match, nunca llama a Supabase", async () => {
    const res = await POST(
      makeRequest({
        fullName: "Diana Pérez",
        email: "diana@example.com",
        password: "supersecret1",
        confirmPassword: "otra12345",
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("passwords_dont_match");
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("email inválido → 400 validation_failed, nunca llama a Supabase", async () => {
    const res = await POST(
      makeRequest({
        fullName: "Diana Pérez",
        email: "no-es-un-email",
        password: "supersecret1",
        confirmPassword: "supersecret1",
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("nombre completo vacío → 400 validation_failed, nunca llama a Supabase", async () => {
    const res = await POST(
      makeRequest({
        fullName: "   ",
        email: "diana@example.com",
        password: "supersecret1",
        confirmPassword: "supersecret1",
      })
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
      makeRequest({
        fullName: "Diana Pérez",
        email: "diana@example.com",
        password: "supersecret1",
        confirmPassword: "supersecret1",
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("email_in_use");
    expect(JSON.stringify(body)).not.toContain("already registered");
    // Sin auth.users creado, no hay nada que vincular.
    expect(linkAccountToClientMock).not.toHaveBeenCalled();
  });

  it("payload sin role/client_id — el schema no los acepta como campos válidos, se ignoran", async () => {
    signUpMock.mockResolvedValue({
      data: { user: { id: "u1", email: "diana@example.com" }, session: { access_token: "t" } },
      error: null,
    });

    await POST(
      makeRequest({
        fullName: "Diana Pérez",
        email: "diana@example.com",
        password: "supersecret1",
        confirmPassword: "supersecret1",
        role: "admin",
        client_id: "11111111-1111-1111-1111-111111111111",
      })
    );

    // signUp() solo recibe email/password/full_name (como metadata) —
    // nada más pudo colarse.
    expect(signUpMock).toHaveBeenCalledWith({
      email: "diana@example.com",
      password: "supersecret1",
      options: {
        data: { full_name: "Diana Pérez" },
        emailRedirectTo: `${SITE_URL}/auth/callback?locale=es`,
      },
    });
    // Tampoco a linkAccountToClient — su único cliente elegible viene de
    // buscar/crear por el email real, nunca de un client_id del body.
    expect(linkAccountToClientMock).toHaveBeenCalledWith({
      userId: "u1",
      fullName: "Diana Pérez",
      email: "diana@example.com",
    });
    const callArgs = linkAccountToClientMock.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty("clientId");
    expect(callArgs).not.toHaveProperty("client_id");
  });

  it("locale='es' → emailRedirectTo incluye ?locale=es", async () => {
    signUpMock.mockResolvedValue({
      data: { user: { id: "u1", email: "diana@example.com" }, session: { access_token: "t" } },
      error: null,
    });

    await POST(
      makeRequest({
        fullName: "Diana Pérez",
        email: "diana@example.com",
        password: "supersecret1",
        confirmPassword: "supersecret1",
        locale: "es",
      })
    );

    expect(signUpMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: `${SITE_URL}/auth/callback?locale=es`,
        }),
      })
    );
  });

  it("locale='en' → emailRedirectTo incluye ?locale=en", async () => {
    signUpMock.mockResolvedValue({
      data: { user: { id: "u1", email: "diana@example.com" }, session: { access_token: "t" } },
      error: null,
    });

    await POST(
      makeRequest({
        fullName: "Diana Pérez",
        email: "diana@example.com",
        password: "supersecret1",
        confirmPassword: "supersecret1",
        locale: "en",
      })
    );

    expect(signUpMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: `${SITE_URL}/auth/callback?locale=en`,
        }),
      })
    );
  });

  it("locale inválido / no reconocido → fallback seguro a 'es', nunca se refleja verbatim en la URL", async () => {
    signUpMock.mockResolvedValue({
      data: { user: { id: "u1", email: "diana@example.com" }, session: { access_token: "t" } },
      error: null,
    });

    await POST(
      makeRequest({
        fullName: "Diana Pérez",
        email: "diana@example.com",
        password: "supersecret1",
        confirmPassword: "supersecret1",
        locale: "https://evil.example.com",
      })
    );

    const [[callArgs]] = signUpMock.mock.calls;
    expect(callArgs.options.emailRedirectTo).toBe(`${SITE_URL}/auth/callback?locale=es`);
    expect(callArgs.options.emailRedirectTo).not.toContain("evil.example.com");
  });

  it("linkAccountToClient falla → el registro igual responde 200 ok:true, el error nunca llega a la respuesta HTTP", async () => {
    signUpMock.mockResolvedValue({
      data: { user: { id: "u1", email: "diana@example.com" }, session: { access_token: "t" } },
      error: null,
    });
    linkAccountToClientMock.mockRejectedValue(
      new Error("[profiles] setProfileClientId failed: 42501 permission denied")
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(
      makeRequest({
        fullName: "Diana Pérez",
        email: "diana@example.com",
        password: "supersecret1",
        confirmPassword: "supersecret1",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.sessionActive).toBe(true);
    expect(JSON.stringify(body)).not.toContain("permission denied");
    expect(JSON.stringify(body)).not.toContain("setProfileClientId");
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

/**
 * Cobertura dedicada al límite de /api/auth/register (15/10min, subido
 * desde 5/10min). IP fija y exclusiva de este bloque (rango de
 * documentación RFC 5737, nunca usado por el ipCounter de arriba) para
 * poder ejercer el límite real de 15 dentro de un mismo test, sin
 * interferir con — ni ser interferido por — los demás tests de este
 * archivo (cada uno usa su propia IP vía ipCounter precisamente para
 * evitar esto).
 */
describe("rate limiting de /api/auth/register — nuevo límite 15/10min", () => {
  beforeEach(() => {
    isClientAuthConfiguredMock.mockReset();
    signUpMock.mockReset();
    linkAccountToClientMock.mockReset();
    isClientAuthConfiguredMock.mockReturnValue(true);
    signUpMock.mockResolvedValue({
      data: { user: { id: "u1", email: "rl-register@example.com" }, session: { access_token: "t" } },
      error: null,
    });
    linkAccountToClientMock.mockResolvedValue({ clientId: "client-1", clientWasCreated: true });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function fixedIpRegisterRequest(): NextRequest {
    return new NextRequest("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.99" },
      body: JSON.stringify({
        fullName: "Rate Limit Test",
        email: "rl-register@example.com",
        password: "supersecret1",
        confirmPassword: "supersecret1",
      }),
    });
  }

  it("1-2. permite los primeros 15 requests, bloquea el 16º con 429", async () => {
    for (let i = 0; i < 15; i++) {
      const res = await POST(fixedIpRegisterRequest());
      expect(res.status).toBe(200);
    }

    const blocked = await POST(fixedIpRegisterRequest());
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.error).toBe("rate_limited");
  });

  it("3. tras 10 minutos + 1ms, el bucket se reinicia y vuelve a permitir requests", async () => {
    for (let i = 0; i < 15; i++) {
      await POST(fixedIpRegisterRequest());
    }
    const blocked = await POST(fixedIpRegisterRequest());
    expect(blocked.status).toBe(429);

    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    const afterWindow = await POST(fixedIpRegisterRequest());
    expect(afterWindow.status).toBe(200);
  });
});
