import { describe, it, expect, afterEach, vi } from "vitest";
import {
  requestContactRequestStatusChange,
  requestConvertContactRequestToClient,
  requestDeleteContactRequest,
} from "../ContactRequestActions";

// Same isolated-from-rendering pattern as ConversationActions.test.ts —
// see that file's note on this project's lack of component-rendering
// test infrastructure.

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestContactRequestStatusChange", () => {
  it("éxito → status success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: true, status: "contacted" })));
    const outcome = await requestContactRequestStatusChange("req-1", "contacted");
    expect(outcome).toEqual({ status: "success" });
  });

  it("401 → unauthorized", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: false }, 401)));
    const outcome = await requestContactRequestStatusChange("req-1", "contacted");
    expect(outcome).toEqual({ status: "error", code: "unauthorized" });
  });

  it("404 → not_found", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: false }, 404)));
    const outcome = await requestContactRequestStatusChange("req-1", "contacted");
    expect(outcome).toEqual({ status: "error", code: "not_found" });
  });

  it("error de red → generic", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const outcome = await requestContactRequestStatusChange("req-1", "contacted");
    expect(outcome).toEqual({ status: "error", code: "generic" });
  });
});

describe("requestConvertContactRequestToClient", () => {
  it("éxito, cliente nuevo → status success, created true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true, client: { id: "client-1" }, created: true }))
    );
    const outcome = await requestConvertContactRequestToClient("req-1");
    expect(outcome).toEqual({ status: "success", clientId: "client-1", created: true });
  });

  it("éxito, cliente existente reutilizado → status success, created false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true, client: { id: "client-2" }, created: false }))
    );
    const outcome = await requestConvertContactRequestToClient("req-1");
    expect(outcome).toEqual({ status: "success", clientId: "client-2", created: false });
  });

  it("401 → unauthorized", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: false }, 401)));
    const outcome = await requestConvertContactRequestToClient("req-1");
    expect(outcome).toEqual({ status: "error", code: "unauthorized" });
  });

  it("404 → not_found", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: false }, 404)));
    const outcome = await requestConvertContactRequestToClient("req-1");
    expect(outcome).toEqual({ status: "error", code: "not_found" });
  });

  it("409 client_not_found → code client_not_found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, error: "client_not_found" }, 409))
    );
    const outcome = await requestConvertContactRequestToClient("req-1");
    expect(outcome).toEqual({ status: "error", code: "client_not_found" });
  });

  it("error de red → generic", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const outcome = await requestConvertContactRequestToClient("req-1");
    expect(outcome).toEqual({ status: "error", code: "generic" });
  });
});

describe("requestDeleteContactRequest", () => {
  it("éxito → status success", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await requestDeleteContactRequest("req-1");

    expect(outcome).toEqual({ status: "success" });
    // Confirma el método/endpoint exactos — DELETE contra la ruta admin,
    // nunca una llamada directa a Supabase desde el navegador.
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/contact-requests/req-1", { method: "DELETE" });
  });

  it("401 → unauthorized", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: false }, 401)));
    const outcome = await requestDeleteContactRequest("req-1");
    expect(outcome).toEqual({ status: "error", code: "unauthorized" });
  });

  it("404 → not_found", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: false }, 404)));
    const outcome = await requestDeleteContactRequest("req-1");
    expect(outcome).toEqual({ status: "error", code: "not_found" });
  });

  it("error de red → generic", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const outcome = await requestDeleteContactRequest("req-1");
    expect(outcome).toEqual({ status: "error", code: "generic" });
  });
});
