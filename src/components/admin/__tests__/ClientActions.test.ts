import { describe, it, expect, afterEach, vi } from "vitest";
import { requestDeleteClient } from "../ClientActions";

// Same vi.stubGlobal("fetch", ...) pattern already used throughout this
// project (paypalWebhook.test.ts, ConversationActions.test.ts).

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestDeleteClient", () => {
  it("éxito → status success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true }))
    );

    const outcome = await requestDeleteClient("client-1");

    expect(outcome).toEqual({ status: "success" });
  });

  it("409 has_related_projects → code has_related_projects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "has_related_projects" }, 409))
    );

    const outcome = await requestDeleteClient("client-2");

    expect(outcome).toEqual({ status: "error", code: "has_related_projects" });
  });

  it("409 has_payments → code has_payments", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "has_payments" }, 409))
    );

    const outcome = await requestDeleteClient("client-2b");

    expect(outcome).toEqual({ status: "error", code: "has_payments" });
  });

  it("409 con motivo no reconocido → code protected (fallback defensivo, nunca 'generic' para un 409)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "some_future_reason" }, 409))
    );

    const outcome = await requestDeleteClient("client-2c");

    expect(outcome).toEqual({ status: "error", code: "protected" });
  });

  it("404 cliente inexistente → code not_found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "not_found" }, 404))
    );

    const outcome = await requestDeleteClient("client-3");

    expect(outcome).toEqual({ status: "error", code: "not_found" });
  });

  it("401 no autorizado → code unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "unauthorized" }, 401))
    );

    const outcome = await requestDeleteClient("client-4");

    expect(outcome).toEqual({ status: "error", code: "unauthorized" });
  });

  it("error inesperado (500) → code generic", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "delete_failed" }, 500))
    );

    const outcome = await requestDeleteClient("client-5");

    expect(outcome).toEqual({ status: "error", code: "generic" });
  });

  it("fallo de red → code generic, nunca se propaga la excepción", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    const outcome = await requestDeleteClient("client-6");

    expect(outcome).toEqual({ status: "error", code: "generic" });
  });
});
