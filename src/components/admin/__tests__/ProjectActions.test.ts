import { describe, it, expect, afterEach, vi } from "vitest";
import { requestDeleteProject } from "../ProjectActions";

// Same vi.stubGlobal("fetch", ...) pattern already used throughout this
// project (ClientActions.test.ts, ConversationActions.test.ts).

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestDeleteProject", () => {
  it("éxito → status success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true }))
    );

    const outcome = await requestDeleteProject("project-1");

    expect(outcome).toEqual({ status: "success" });
  });

  it("409 has_payments → code has_payments", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "has_payments" }, 409))
    );

    const outcome = await requestDeleteProject("project-2");

    expect(outcome).toEqual({ status: "error", code: "has_payments" });
  });

  it("409 has_payment_attempts → code has_payment_attempts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "has_payment_attempts" }, 409))
    );

    const outcome = await requestDeleteProject("project-2b");

    expect(outcome).toEqual({ status: "error", code: "has_payment_attempts" });
  });

  it("409 active_work → code active_work", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "active_work" }, 409))
    );

    const outcome = await requestDeleteProject("project-2c");

    expect(outcome).toEqual({ status: "error", code: "active_work" });
  });

  it("409 con motivo no reconocido → code generic (nunca inventa una razón)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "some_future_reason" }, 409))
    );

    const outcome = await requestDeleteProject("project-2d");

    expect(outcome).toEqual({ status: "error", code: "generic" });
  });

  it("404 proyecto inexistente → code not_found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "not_found" }, 404))
    );

    const outcome = await requestDeleteProject("project-3");

    expect(outcome).toEqual({ status: "error", code: "not_found" });
  });

  it("401 no autorizado → code unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "unauthorized" }, 401))
    );

    const outcome = await requestDeleteProject("project-4");

    expect(outcome).toEqual({ status: "error", code: "unauthorized" });
  });

  it("error inesperado (500) → code generic", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "delete_failed" }, 500))
    );

    const outcome = await requestDeleteProject("project-5");

    expect(outcome).toEqual({ status: "error", code: "generic" });
  });

  it("fallo de red → code generic, nunca se propaga la excepción", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    const outcome = await requestDeleteProject("project-6");

    expect(outcome).toEqual({ status: "error", code: "generic" });
  });
});
