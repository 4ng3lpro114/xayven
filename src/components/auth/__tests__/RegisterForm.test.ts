import { describe, it, expect, afterEach, vi } from "vitest";
import { deriveRegisterOutcome, requestRegister } from "../RegisterForm";

// Same isolated-from-rendering pattern as ContactForm.test.ts — no
// component-rendering test infrastructure in this project.

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deriveRegisterOutcome", () => {
  it("200 ok:true, sessionActive:true → success, sessionActive true", () => {
    const outcome = deriveRegisterOutcome({ status: 200 }, { ok: true, sessionActive: true });
    expect(outcome).toEqual({ status: "success", sessionActive: true });
  });

  it("200 ok:true, sessionActive:false (confirmación de email pendiente) → success, sessionActive false", () => {
    const outcome = deriveRegisterOutcome({ status: 200 }, { ok: true, sessionActive: false });
    expect(outcome).toEqual({ status: "success", sessionActive: false });
  });

  it("error email_in_use → code email_in_use", () => {
    const outcome = deriveRegisterOutcome({ status: 400 }, { ok: false, error: "email_in_use" });
    expect(outcome).toEqual({ status: "error", code: "email_in_use" });
  });

  it("error passwords_dont_match → code passwords_dont_match", () => {
    const outcome = deriveRegisterOutcome({ status: 400 }, { ok: false, error: "passwords_dont_match" });
    expect(outcome).toEqual({ status: "error", code: "passwords_dont_match" });
  });

  it("429 → rate_limited", () => {
    const outcome = deriveRegisterOutcome({ status: 429 }, { ok: false });
    expect(outcome).toEqual({ status: "error", code: "rate_limited" });
  });

  it("cualquier otro error → generic", () => {
    const outcome = deriveRegisterOutcome({ status: 500 }, { ok: false });
    expect(outcome).toEqual({ status: "error", code: "generic" });
  });
});

describe("requestRegister", () => {
  it("éxito → status success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: true, sessionActive: true })));
    const outcome = await requestRegister({
      fullName: "Diana Pérez",
      email: "diana@example.com",
      password: "supersecret1",
      confirmPassword: "supersecret1",
      locale: "es",
    });
    expect(outcome).toEqual({ status: "success", sessionActive: true });
  });

  it("error de red → generic", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const outcome = await requestRegister({
      fullName: "Diana Pérez",
      email: "diana@example.com",
      password: "supersecret1",
      confirmPassword: "supersecret1",
      locale: "es",
    });
    expect(outcome).toEqual({ status: "error", code: "generic" });
  });

  it("llama exactamente a /api/auth/register con POST — nunca a Supabase directamente desde el navegador", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, sessionActive: false }));
    vi.stubGlobal("fetch", fetchMock);

    await requestRegister({
      fullName: "Diana Pérez",
      email: "diana@example.com",
      password: "supersecret1",
      confirmPassword: "supersecret1",
      locale: "es",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("incluye fullName y locale en el body enviado al servidor", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
      jsonResponse({ ok: true, sessionActive: false })
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestRegister({
      fullName: "Diana Pérez",
      email: "diana@example.com",
      password: "supersecret1",
      confirmPassword: "supersecret1",
      locale: "en",
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init!.body as string)).toEqual({
      fullName: "Diana Pérez",
      email: "diana@example.com",
      password: "supersecret1",
      confirmPassword: "supersecret1",
      locale: "en",
    });
  });
});
