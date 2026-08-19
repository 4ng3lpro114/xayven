import { describe, it, expect, vi, afterEach } from "vitest";
import { notifyPaymentApproved, notifyPaymentDeclined } from "../notify";
import type { Client, Payment, Project } from "../types";

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

const client: Client = {
  id: "client-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  name: "Diana",
  email: "diana@example.com",
  phone: null,
  company: null,
  isCommercial: true,
};

const project: Project = {
  id: "project-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  clientId: client.id,
  name: "Sitio web XAYVEN",
  status: "in_progress",
  currency: "COP",
  totalAmount: 3_000_000,
  paidAmount: 1_500_000,
  portalToken: "token-abc",
};

const payment: Payment = {
  id: "payment-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  projectId: project.id,
  clientId: client.id,
  provider: "WOMPI",
  providerTransactionId: "wompi-tx-1",
  reference: "ref-123",
  amount: 1_500_000,
  currency: "COP",
  status: "APPROVED",
  paymentType: "DEPOSIT",
  metadata: {},
};

describe("payments/notify", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  describe("notifyPaymentApproved", () => {
    it("sin RESEND_API_KEY → no llama a fetch, nunca lanza", async () => {
      delete process.env.RESEND_API_KEY;
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      await expect(notifyPaymentApproved(payment, project, client)).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("con RESEND_API_KEY y CONTACT_EMAIL_TO → envía email al cliente Y al admin", async () => {
      process.env.RESEND_API_KEY = "test-key";
      process.env.CONTACT_EMAIL_TO = "admin@example.com";
      const fetchMock = vi.fn(async () => jsonResponse({ id: "email-1" }));
      vi.stubGlobal("fetch", fetchMock);

      await notifyPaymentApproved(payment, project, client);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const clientCallBody = requestBody(fetchMock, 0);
      const adminCallBody = requestBody(fetchMock, 1);

      expect(clientCallBody.to).toEqual([client.email]);
      expect(adminCallBody.to).toEqual(["admin@example.com"]);
    });

    it("la notificación al admin incluye reply_to = email del cliente", async () => {
      process.env.RESEND_API_KEY = "test-key";
      process.env.CONTACT_EMAIL_TO = "admin@example.com";
      const fetchMock = vi.fn(async () => jsonResponse({}));
      vi.stubGlobal("fetch", fetchMock);

      await notifyPaymentApproved(payment, project, client);

      const adminCallBody = requestBody(fetchMock, 1);
      expect(adminCallBody.reply_to).toBe(client.email);
    });

    it("el correo al cliente NO lleva reply_to (from ya es hello@xayven.com)", async () => {
      process.env.RESEND_API_KEY = "test-key";
      process.env.CONTACT_EMAIL_TO = "admin@example.com";
      const fetchMock = vi.fn(async () => jsonResponse({}));
      vi.stubGlobal("fetch", fetchMock);

      await notifyPaymentApproved(payment, project, client);

      const clientCallBody = requestBody(fetchMock, 0);
      expect(clientCallBody.reply_to).toBeUndefined();
    });

    it("sin CONTACT_EMAIL_TO → solo envía el email al cliente, nunca al admin", async () => {
      process.env.RESEND_API_KEY = "test-key";
      delete process.env.CONTACT_EMAIL_TO;
      const fetchMock = vi.fn(async () => jsonResponse({}));
      vi.stubGlobal("fetch", fetchMock);

      await notifyPaymentApproved(payment, project, client);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = requestBody(fetchMock, 0);
      expect(body.to).toEqual([client.email]);
    });

    it("Resend responde error en el correo del cliente → no lanza, y el correo del admin igual se intenta", async () => {
      process.env.RESEND_API_KEY = "test-key";
      process.env.CONTACT_EMAIL_TO = "admin@example.com";
      const fetchMock = vi.fn(async () => jsonResponse({ error: "boom" }, 500));
      vi.stubGlobal("fetch", fetchMock);

      await expect(notifyPaymentApproved(payment, project, client)).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("notifyPaymentDeclined", () => {
    it("envía solo al cliente, nunca al admin", async () => {
      process.env.RESEND_API_KEY = "test-key";
      process.env.CONTACT_EMAIL_TO = "admin@example.com";
      const fetchMock = vi.fn(async () => jsonResponse({}));
      vi.stubGlobal("fetch", fetchMock);

      await notifyPaymentDeclined(payment, project, client);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = requestBody(fetchMock, 0);
      expect(body.to).toEqual([client.email]);
    });

    it("fetch lanza excepción de red → nunca propaga", async () => {
      process.env.RESEND_API_KEY = "test-key";
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("network down");
        })
      );

      await expect(notifyPaymentDeclined(payment, project, client)).resolves.toBeUndefined();
    });
  });
});
