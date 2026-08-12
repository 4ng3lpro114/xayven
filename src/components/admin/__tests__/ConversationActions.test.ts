import { describe, it, expect, afterEach, vi } from "vitest";
import { requestConvertToClient, requestDeleteConversation } from "../ConversationActions";

/**
 * Tests the request/response-interpretation logic in isolation from
 * rendering — same `vi.stubGlobal("fetch", ...)` pattern already used in
 * src/lib/payments/__tests__/paypalWebhook.test.ts.
 *
 * NOTE on coverage gap: this project has no component-rendering/
 * interaction test infrastructure installed (no @testing-library/react,
 * no jsdom — vitest.config.mts runs in a plain "node" environment).
 * "Loading state visible" and "double-click ignored while loading" are
 * therefore NOT covered by an automated test here, even though the
 * component implements both (a `disabled={loading}` button plus an
 * `if (loading) return;` guard at the top of the click handler) — real
 * coverage of those two would need installing @testing-library/react +
 * jsdom, which wasn't part of what was authorized for this phase. See
 * ConversationActions.render.test.ts for what IS covered without new
 * dependencies (conditional rendering via react-dom/server).
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestConvertToClient", () => {
  it("éxito, created=true → status success, created true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true, client: { id: "client-1" }, created: true }))
    );

    const outcome = await requestConvertToClient("conv-1");

    expect(outcome).toEqual({ status: "success", clientId: "client-1", created: true });
  });

  it("éxito, created=false (cliente ya existente) → status success, created false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true, client: { id: "client-2" }, created: false }))
    );

    const outcome = await requestConvertToClient("conv-2");

    expect(outcome).toEqual({ status: "success", clientId: "client-2", created: false });
  });

  it("falta email → code missing_email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "missing_email" }, 400))
    );

    const outcome = await requestConvertToClient("conv-3");

    expect(outcome).toEqual({ status: "error", code: "missing_email" });
  });

  it("faltan nombre y company → code missing_name_and_company", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "missing_name_and_company" }, 400))
    );

    const outcome = await requestConvertToClient("conv-4");

    expect(outcome).toEqual({ status: "error", code: "missing_name_and_company" });
  });

  it("401 no autorizado → code unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "unauthorized" }, 401))
    );

    const outcome = await requestConvertToClient("conv-5");

    expect(outcome).toEqual({ status: "error", code: "unauthorized" });
  });

  it("404 conversación inexistente → code not_found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "conversation_not_found" }, 404))
    );

    const outcome = await requestConvertToClient("conv-6");

    expect(outcome).toEqual({ status: "error", code: "not_found" });
  });

  it("error inesperado (500) → code generic, sin exponer el detalle real", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "conversion_failed" }, 500))
    );

    const outcome = await requestConvertToClient("conv-7");

    expect(outcome).toEqual({ status: "error", code: "generic" });
  });

  it("fallo de red (fetch lanza) → code generic, nunca se propaga la excepción", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    const outcome = await requestConvertToClient("conv-8");

    expect(outcome).toEqual({ status: "error", code: "generic" });
  });

  it("respuesta 200 con JSON inválido → code generic, no crashea", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not json", { status: 200 }))
    );

    const outcome = await requestConvertToClient("conv-9");

    expect(outcome).toEqual({ status: "error", code: "generic" });
  });
});

describe("requestDeleteConversation", () => {
  it("éxito → status success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true }))
    );

    const outcome = await requestDeleteConversation("conv-del-1");

    expect(outcome).toEqual({ status: "success" });
  });

  it("409 con cliente vinculado → code has_linked_client", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "has_linked_client" }, 409))
    );

    const outcome = await requestDeleteConversation("conv-del-2");

    expect(outcome).toEqual({ status: "error", code: "has_linked_client" });
  });

  it("404 conversación inexistente → code not_found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "not_found" }, 404))
    );

    const outcome = await requestDeleteConversation("conv-del-3");

    expect(outcome).toEqual({ status: "error", code: "not_found" });
  });

  it("401 no autorizado → code unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "unauthorized" }, 401))
    );

    const outcome = await requestDeleteConversation("conv-del-4");

    expect(outcome).toEqual({ status: "error", code: "unauthorized" });
  });

  it("error inesperado (500) → code generic", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "delete_failed" }, 500))
    );

    const outcome = await requestDeleteConversation("conv-del-5");

    expect(outcome).toEqual({ status: "error", code: "generic" });
  });

  it("fallo de red → code generic, nunca se propaga la excepción", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    const outcome = await requestDeleteConversation("conv-del-6");

    expect(outcome).toEqual({ status: "error", code: "generic" });
  });
});
