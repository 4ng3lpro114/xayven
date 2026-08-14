import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import type { Payment } from "@/lib/payments/types";

const URL = "http://localhost/api/payments/paypal/webhook";

const VALID_HEADERS = {
  "content-type": "application/json",
  "paypal-transmission-id": "txm-1",
  "paypal-transmission-time": "2026-01-01T00:00:00Z",
  "paypal-cert-url": "https://api.paypal.com/cert.pem",
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-transmission-sig": "sig-abc",
};

function buildBody(overrides: {
  eventType?: string;
  orderId?: string;
  referenceId?: string | null;
} = {}) {
  return {
    event_type: overrides.eventType ?? "PAYMENT.CAPTURE.COMPLETED",
    resource: {
      id: "capture-1",
      supplementary_data: { related_ids: { order_id: overrides.orderId ?? "order-123" } },
      custom_id: overrides.referenceId === undefined ? "payment-1" : overrides.referenceId ?? undefined,
    },
  };
}

function buildRequest(body: unknown, headers: Record<string, string> = VALID_HEADERS): NextRequest {
  return new NextRequest(URL, { method: "POST", headers, body: JSON.stringify(body) });
}

function fakePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "payment-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    projectId: "project-1",
    clientId: "client-1",
    provider: "PAYPAL",
    providerTransactionId: "order-123",
    reference: "XAYVEN-abc-123",
    amount: 150000,
    currency: "USD",
    status: "APPROVED",
    paymentType: "DEPOSIT",
    metadata: {},
    ...overrides,
  };
}

/** `readPayPalWebhookHeaders`/`extractOrderInfo`/`PAYPAL_EVENT_STATUS_MAP` are
 *  pure and kept real in every test below — only `verifyPayPalWebhookSignature`
 *  (a real network call to PayPal) is mocked. */
async function mockPaypalWebhookModule(verified: boolean) {
  vi.doMock("@/lib/payments/providers/paypalWebhook", async () => {
    const actual = await vi.importActual<typeof import("@/lib/payments/providers/paypalWebhook")>(
      "@/lib/payments/providers/paypalWebhook"
    );
    return { ...actual, verifyPayPalWebhookSignature: vi.fn(async () => verified) };
  });
}

describe("POST /api/payments/paypal/webhook", () => {
  const ORIGINAL_ENV = { ...process.env };
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    process.env.PAYPAL_CLIENT_ID = "test-client-id";
    process.env.PAYPAL_CLIENT_SECRET = "test-client-secret";
    process.env.PAYPAL_WEBHOOK_ID = "test-webhook-id";
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.doUnmock("@/lib/payments/providers/paypalWebhook");
    vi.doUnmock("@/lib/db/paymentsStore");
    vi.doUnmock("@/lib/payments/service");
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // A. Valid webhook, genuinely new transition → WEBHOOK_PROCESSED.
  it("A. procesa correctamente un webhook válido con una transición nueva", async () => {
    const payment = fakePayment({ status: "APPROVED" });
    await mockPaypalWebhookModule(true);
    vi.doMock("@/lib/db/paymentsStore", () => ({
      getPaymentByProviderTransactionId: vi.fn(async () => payment),
      getPaymentById: vi.fn(async () => null),
    }));
    vi.doMock("@/lib/payments/service", () => ({
      applyProviderStatus: vi.fn(async () => ({ payment, project: null, wasNewTransition: true })),
    }));

    const { POST } = await import("@/app/api/payments/paypal/webhook/route");
    const res = await POST(buildRequest(buildBody()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, matched: true, newTransition: true });
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[webhook] WEBHOOK_RECEIVED",
      expect.objectContaining({ provider: "PAYPAL" })
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[webhook] WEBHOOK_PROCESSED",
      expect.objectContaining({ provider: "PAYPAL", paymentId: "payment-1", status: "APPROVED" })
    );
  });

  // B. Invalid signature → rejected, never reaches applyProviderStatus.
  it("B. rechaza un webhook con firma inválida sin tocar el estado", async () => {
    await mockPaypalWebhookModule(false);
    const getPaymentByProviderTransactionId = vi.fn();
    const applyProviderStatus = vi.fn();
    vi.doMock("@/lib/db/paymentsStore", () => ({
      getPaymentByProviderTransactionId,
      getPaymentById: vi.fn(async () => null),
    }));
    vi.doMock("@/lib/payments/service", () => ({ applyProviderStatus }));

    const { POST } = await import("@/app/api/payments/paypal/webhook/route");
    const res = await POST(buildRequest(buildBody()));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ ok: false, error: "invalid_signature" });
    expect(getPaymentByProviderTransactionId).not.toHaveBeenCalled();
    expect(applyProviderStatus).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[webhook] WEBHOOK_REJECTED_SIGNATURE",
      expect.objectContaining({ provider: "PAYPAL" })
    );
  });

  // C. Event type not in PAYPAL_EVENT_STATUS_MAP → ignored, never processed.
  it("C. ignora un evento fuera del mapa de estados sin llamar a applyProviderStatus", async () => {
    await mockPaypalWebhookModule(true);
    const applyProviderStatus = vi.fn();
    vi.doMock("@/lib/db/paymentsStore", () => ({
      getPaymentByProviderTransactionId: vi.fn(),
      getPaymentById: vi.fn(async () => null),
    }));
    vi.doMock("@/lib/payments/service", () => ({ applyProviderStatus }));

    const { POST } = await import("@/app/api/payments/paypal/webhook/route");
    const res = await POST(buildRequest(buildBody({ eventType: "CHECKOUT.ORDER.APPROVED" })));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, ignored: true });
    expect(applyProviderStatus).not.toHaveBeenCalled();
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[webhook] WEBHOOK_IGNORED_EVENT",
      expect.objectContaining({ provider: "PAYPAL", eventType: "CHECKOUT.ORDER.APPROVED" })
    );
  });

  // D. Valid + verified, but no matching Payment found (checked before ever
  // calling applyProviderStatus, same early-exit as the pre-existing code).
  it("D. reporta un Payment inexistente sin fallar la petición", async () => {
    await mockPaypalWebhookModule(true);
    const applyProviderStatus = vi.fn();
    vi.doMock("@/lib/db/paymentsStore", () => ({
      getPaymentByProviderTransactionId: vi.fn(async () => null),
      getPaymentById: vi.fn(async () => null),
    }));
    vi.doMock("@/lib/payments/service", () => ({ applyProviderStatus }));

    const { POST } = await import("@/app/api/payments/paypal/webhook/route");
    const res = await POST(buildRequest(buildBody()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, matched: false });
    expect(applyProviderStatus).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[webhook] WEBHOOK_PAYMENT_NOT_FOUND",
      expect.objectContaining({ provider: "PAYPAL", orderId: "order-123" })
    );
  });

  // E. Idempotent duplicate — already recorded/terminal, no new transition.
  it("E. distingue un duplicado idempotente de un procesamiento nuevo", async () => {
    const payment = fakePayment({ status: "APPROVED" });
    await mockPaypalWebhookModule(true);
    vi.doMock("@/lib/db/paymentsStore", () => ({
      getPaymentByProviderTransactionId: vi.fn(async () => payment),
      getPaymentById: vi.fn(async () => null),
    }));
    vi.doMock("@/lib/payments/service", () => ({
      applyProviderStatus: vi.fn(async () => ({ payment, project: null, wasNewTransition: false })),
    }));

    const { POST } = await import("@/app/api/payments/paypal/webhook/route");
    const res = await POST(buildRequest(buildBody()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, matched: true, newTransition: false });
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[webhook] WEBHOOK_IDEMPOTENT_DUPLICATE",
      expect.objectContaining({ provider: "PAYPAL", paymentId: "payment-1" })
    );
    expect(consoleInfoSpy).not.toHaveBeenCalledWith("[webhook] WEBHOOK_PROCESSED", expect.anything());
  });

  // F. Internal error — never leaks the raw error to the caller.
  it("F. captura un error interno inesperado, responde 500 sin filtrar detalles", async () => {
    const payment = fakePayment();
    await mockPaypalWebhookModule(true);
    vi.doMock("@/lib/db/paymentsStore", () => ({
      getPaymentByProviderTransactionId: vi.fn(async () => payment),
      getPaymentById: vi.fn(async () => null),
    }));
    vi.doMock("@/lib/payments/service", () => ({
      applyProviderStatus: vi.fn(async () => {
        throw new Error("supabase connection reset: super-secret-internal-detail");
      }),
    }));

    const { POST } = await import("@/app/api/payments/paypal/webhook/route");
    const res = await POST(buildRequest(buildBody()));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ ok: false, error: "internal_error" });
    expect(JSON.stringify(json)).not.toContain("super-secret-internal-detail");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[webhook] WEBHOOK_INTERNAL_ERROR",
      expect.objectContaining({ provider: "PAYPAL" })
    );
  });

  // G. Two deliveries of the same event in sequence never double-apply — the
  // route must reflect exactly what applyProviderStatus reports each time.
  it("G. dos entregas seguidas del mismo evento producen PROCESSED y luego IDEMPOTENT_DUPLICATE, nunca dos veces PROCESSED", async () => {
    const payment = fakePayment({ status: "APPROVED" });
    await mockPaypalWebhookModule(true);
    const applyProviderStatus = vi
      .fn()
      .mockResolvedValueOnce({ payment, project: null, wasNewTransition: true })
      .mockResolvedValueOnce({ payment, project: null, wasNewTransition: false });
    vi.doMock("@/lib/db/paymentsStore", () => ({
      getPaymentByProviderTransactionId: vi.fn(async () => payment),
      getPaymentById: vi.fn(async () => null),
    }));
    vi.doMock("@/lib/payments/service", () => ({ applyProviderStatus }));

    const { POST } = await import("@/app/api/payments/paypal/webhook/route");
    const first = await (await POST(buildRequest(buildBody()))).json();
    const second = await (await POST(buildRequest(buildBody()))).json();

    expect(first.newTransition).toBe(true);
    expect(second.newTransition).toBe(false);
    expect(applyProviderStatus).toHaveBeenCalledTimes(2);
    const processedCalls = consoleInfoSpy.mock.calls.filter(
      (call: unknown[]) => call[0] === "[webhook] WEBHOOK_PROCESSED"
    );
    const duplicateCalls = consoleInfoSpy.mock.calls.filter(
      (call: unknown[]) => call[0] === "[webhook] WEBHOOK_IDEMPOTENT_DUPLICATE"
    );
    expect(processedCalls).toHaveLength(1);
    expect(duplicateCalls).toHaveLength(1);
  });

  // Missing signature headers must still be refused with the pre-existing
  // shape — untouched by Fase 3B.
  it("rechaza por falta de headers de firma (comportamiento preexistente intacto)", async () => {
    await mockPaypalWebhookModule(true);
    vi.doMock("@/lib/db/paymentsStore", () => ({
      getPaymentByProviderTransactionId: vi.fn(),
      getPaymentById: vi.fn(),
    }));
    vi.doMock("@/lib/payments/service", () => ({ applyProviderStatus: vi.fn() }));

    const { POST } = await import("@/app/api/payments/paypal/webhook/route");
    const res = await POST(buildRequest(buildBody(), { "content-type": "application/json" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ ok: false, error: "missing_signature_headers" });
  });
});
