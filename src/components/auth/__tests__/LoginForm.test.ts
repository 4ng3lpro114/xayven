import { describe, it, expect, afterEach, vi } from "vitest";
import { deriveLoginOutcome, requestLogin } from "../LoginForm";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deriveLoginOutcome", () => {
  it("200 ok:true → success", () => {
    expect(deriveLoginOutcome({ status: 200 }, { ok: true })).toEqual({ status: "success" });
  });

  it("401 → invalid_credentials", () => {
    expect(deriveLoginOutcome({ status: 401 }, { ok: false, error: "invalid_credentials" })).toEqual({
      status: "error",
      code: "invalid_credentials",
    });
  });

  it("429 → rate_limited", () => {
    expect(deriveLoginOutcome({ status: 429 }, { ok: false })).toEqual({
      status: "error",
      code: "rate_limited",
    });
  });

  it("cualquier otro error → generic", () => {
    expect(deriveLoginOutcome({ status: 500 }, { ok: false })).toEqual({
      status: "error",
      code: "generic",
    });
  });
});

describe("requestLogin", () => {
  it("login válido → success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: true })));
    const outcome = await requestLogin({ email: "diana@example.com", password: "correcta" });
    expect(outcome).toEqual({ status: "success" });
  });

  it("login inválido (401) → invalid_credentials, sin revelar más detalle", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "invalid_credentials" }, 401))
    );
    const outcome = await requestLogin({ email: "diana@example.com", password: "incorrecta" });
    expect(outcome).toEqual({ status: "error", code: "invalid_credentials" });
  });

  it("error de red → generic", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const outcome = await requestLogin({ email: "diana@example.com", password: "x" });
    expect(outcome).toEqual({ status: "error", code: "generic" });
  });
});
