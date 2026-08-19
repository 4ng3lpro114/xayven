import { describe, it, expect, vi, afterEach } from "vitest";
import { sendEmail } from "../send";

const ORIGINAL_ENV = { ...process.env };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Structural, version-agnostic over vi.fn's exact generic shape — every
 *  fetch mock in this file only ever needs its `[url, init]` call args. */
function requestBody(fetchMock: { mock: { calls: unknown[][] } }, callIndex = 0): Record<string, unknown> {
  const call = fetchMock.mock.calls[callIndex] as [string, RequestInit];
  return JSON.parse(call[1].body as string);
}

describe("sendEmail", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("sin RESEND_API_KEY → { ok: false, reason: 'not_configured' }, nunca llama a fetch", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail({ to: "admin@example.com", subject: "Test", text: "Body" });

    expect(result).toEqual({ ok: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con RESEND_API_KEY y Resend responde éxito → { ok: true }", async () => {
    process.env.RESEND_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => jsonResponse({ id: "email-123" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail({ to: "admin@example.com", subject: "Test", text: "Body" });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("normaliza un `to` de string único al array que espera Resend", async () => {
    process.env.RESEND_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail({ to: "single@example.com", subject: "Test", text: "Body" });

    const sentBody = requestBody(fetchMock);
    expect(sentBody.to).toEqual(["single@example.com"]);
  });

  it("acepta un `to` ya en forma de array sin modificarlo", async () => {
    process.env.RESEND_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail({ to: ["a@example.com", "b@example.com"], subject: "Test", text: "Body" });

    const sentBody = requestBody(fetchMock);
    expect(sentBody.to).toEqual(["a@example.com", "b@example.com"]);
  });

  it("solo incluye reply_to en el body cuando se pasa replyTo", async () => {
    process.env.RESEND_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail({ to: "admin@example.com", subject: "Test", text: "Body" });
    let sentBody = requestBody(fetchMock, 0);
    expect(sentBody.reply_to).toBeUndefined();

    await sendEmail({ to: "admin@example.com", subject: "Test", text: "Body", replyTo: "visitor@example.com" });
    sentBody = requestBody(fetchMock, 1);
    expect(sentBody.reply_to).toBe("visitor@example.com");
  });

  it("usa CONTACT_EMAIL_FROM cuando está seteado, y el fallback de Resend cuando no", async () => {
    process.env.RESEND_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    delete process.env.CONTACT_EMAIL_FROM;
    await sendEmail({ to: "admin@example.com", subject: "Test", text: "Body" });
    expect(requestBody(fetchMock, 0).from).toBe("XAYVEN <onboarding@resend.dev>");

    process.env.CONTACT_EMAIL_FROM = "XAYVEN <hello@xayven.com>";
    await sendEmail({ to: "admin@example.com", subject: "Test", text: "Body" });
    expect(requestBody(fetchMock, 1).from).toBe("XAYVEN <hello@xayven.com>");
  });

  it("Resend responde error HTTP → { ok: false, reason: 'provider_error', status, detail }", async () => {
    process.env.RESEND_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "invalid domain" }, 422))
    );

    const result = await sendEmail({ to: "admin@example.com", subject: "Test", text: "Body" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("provider_error");
      if (result.reason === "provider_error") {
        expect(result.status).toBe(422);
        expect(result.detail).toContain("invalid domain");
      }
    }
  });

  it("fetch lanza una excepción de red → { ok: false, reason: 'unexpected_error' }, nunca propaga", async () => {
    process.env.RESEND_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    const result = await sendEmail({ to: "admin@example.com", subject: "Test", text: "Body" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unexpected_error");
      if (result.reason === "unexpected_error") {
        expect(result.detail).toBe("network down");
      }
    }
  });
});
