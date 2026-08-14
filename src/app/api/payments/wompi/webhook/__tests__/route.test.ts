import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { computeWompiChecksum, type WompiEvent } from "@/lib/payments/providers/wompiWebhook";
import type { Payment } from "@/lib/payments/types";

const SECRET = "test_events_FAKESECRETFORTESTSONLY0000";
const URL = "http://localhost/api/payments/wompi/webhook";
const SIGNED_PROPERTIES = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];

/** Same construction the pure-logic tests use (see wompiWebhook.test.ts) —
 *  a genuinely valid, self-consistent signed event, so these route tests
 *  exercise the real checksum verification rather than mocking it away. */
function buildEvent(overrides: {
  transactionId?: string;
  status?: string;
  reference?: string;
  amountInCents?: number;
  eventType?: string;
  checksum?: string;
} = {}): WompiEvent {
  const event: WompiEvent = {
    event: overrides.eventType ?? "transaction.updated",
    data: {
      transaction: {
        id: overrides.transactionId ?? "txn-123",
        status: overrides.status ?? "APPROVED",
        reference: overrides.reference ?? "XAYVEN-abc-123",
        amount_in_cents: overrides.amountInCents ?? 150_000_00,
        currency: "COP",
      },
    },
    environment: "test",
    signature: { properties: SIGNED_PROPERTIES, checksum: "" },
    timestamp: 1_700_000_000_000,
  };
  event.signature.checksum = overrides.checksum ?? computeWompiChecksum(event, SECRET);
  return event;
}

function buildRequest(event: unknown): NextRequest {
  return new NextRequest(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
}

function fakePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "payment-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    projectId: "project-1",
    clientId: "client-1",
    provider: "WOMPI",
    providerTransactionId: "txn-123",
    reference: "XAYVEN-abc-123",
    amount: 150000,
    currency: "COP",
    status: "APPROVED",
    paymentType: "DEPOSIT",
    metadata: {},
    ...overrides,
  };
}

describe("POST /api/payments/wompi/webhook", () => {
  const ORIGINAL_ENV = { ...process.env };
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    process.env.WOMPI_EVENTS_SECRET = SECRET;
    process.env.WOMPI_ENV = "sandbox";
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.doUnmock("@/lib/payments/service");
    vi.doUnmock("@/lib/db/paymentsStore");
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // A. Valid webhook, genuinely new transition → WEBHOOK_PROCESSED.
  it("A. procesa correctamente un webhook válido con una transición nueva", async () => {
    const payment = fakePayment({ status: "APPROVED" });
    vi.doMock("@/lib/db/paymentsStore", () => ({ getPaymentByReference: vi.fn(async () => null) }));
    vi.doMock("@/lib/payments/service", () => ({
      applyProviderStatus: vi.fn(async () => ({ payment, project: null, wasNewTransition: true })),
    }));

    const { POST } = await import("@/app/api/payments/wompi/webhook/route");
    const res = await POST(buildRequest(buildEvent()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, matched: true, newTransition: true });
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[webhook] WEBHOOK_RECEIVED",
      expect.objectContaining({ provider: "WOMPI" })
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[webhook] WEBHOOK_PROCESSED",
      expect.objectContaining({ provider: "WOMPI", paymentId: "payment-1", status: "APPROVED" })
    );
  });

  // B. Invalid signature → rejected, never reaches applyProviderStatus.
  it("B. rechaza un webhook con firma/checksum inválido sin tocar el estado", async () => {
    const applyProviderStatus = vi.fn();
    vi.doMock("@/lib/db/paymentsStore", () => ({ getPaymentByReference: vi.fn(async () => null) }));
    vi.doMock("@/lib/payments/service", () => ({ applyProviderStatus }));

    const { POST } = await import("@/app/api/payments/wompi/webhook/route");
    const tampered = buildEvent({ checksum: "0".repeat(64) });
    const res = await POST(buildRequest(tampered));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ ok: false, error: "invalid_checksum" });
    expect(applyProviderStatus).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[webhook] WEBHOOK_REJECTED_SIGNATURE",
      expect.objectContaining({ provider: "WOMPI" })
    );
  });

  // C. Event type other than transaction.updated → ignored, never processed.
  it("C. ignora un evento que no sea transaction.updated sin llamar a applyProviderStatus", async () => {
    const applyProviderStatus = vi.fn();
    vi.doMock("@/lib/db/paymentsStore", () => ({ getPaymentByReference: vi.fn(async () => null) }));
    vi.doMock("@/lib/payments/service", () => ({ applyProviderStatus }));

    const { POST } = await import("@/app/api/payments/wompi/webhook/route");
    const res = await POST(buildRequest(buildEvent({ eventType: "transaction.created" })));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, ignored: true });
    expect(applyProviderStatus).not.toHaveBeenCalled();
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[webhook] WEBHOOK_IGNORED_EVENT",
      expect.objectContaining({ provider: "WOMPI", eventType: "transaction.created" })
    );
  });

  // D. Valid + verified, but no matching Payment found.
  it("D. reporta un Payment inexistente sin fallar la petición", async () => {
    vi.doMock("@/lib/db/paymentsStore", () => ({ getPaymentByReference: vi.fn(async () => null) }));
    vi.doMock("@/lib/payments/service", () => ({ applyProviderStatus: vi.fn(async () => null) }));

    const { POST } = await import("@/app/api/payments/wompi/webhook/route");
    const res = await POST(buildRequest(buildEvent()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, matched: false });
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[webhook] WEBHOOK_PAYMENT_NOT_FOUND",
      expect.objectContaining({ provider: "WOMPI" })
    );
  });

  // E. Idempotent duplicate — already recorded/terminal, no new transition.
  it("E. distingue un duplicado idempotente de un procesamiento nuevo", async () => {
    const payment = fakePayment({ status: "APPROVED" });
    vi.doMock("@/lib/db/paymentsStore", () => ({ getPaymentByReference: vi.fn(async () => null) }));
    vi.doMock("@/lib/payments/service", () => ({
      applyProviderStatus: vi.fn(async () => ({ payment, project: null, wasNewTransition: false })),
    }));

    const { POST } = await import("@/app/api/payments/wompi/webhook/route");
    const res = await POST(buildRequest(buildEvent()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, matched: true, newTransition: false });
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[webhook] WEBHOOK_IDEMPOTENT_DUPLICATE",
      expect.objectContaining({ provider: "WOMPI", paymentId: "payment-1" })
    );
    expect(consoleInfoSpy).not.toHaveBeenCalledWith("[webhook] WEBHOOK_PROCESSED", expect.anything());
  });

  // F. Internal error — never leaks the raw error to the caller.
  it("F. captura un error interno inesperado, responde 500 sin filtrar detalles", async () => {
    vi.doMock("@/lib/db/paymentsStore", () => ({ getPaymentByReference: vi.fn(async () => null) }));
    vi.doMock("@/lib/payments/service", () => ({
      applyProviderStatus: vi.fn(async () => {
        throw new Error("supabase connection reset: super-secret-internal-detail");
      }),
    }));

    const { POST } = await import("@/app/api/payments/wompi/webhook/route");
    const res = await POST(buildRequest(buildEvent()));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ ok: false, error: "internal_error" });
    expect(JSON.stringify(json)).not.toContain("super-secret-internal-detail");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[webhook] WEBHOOK_INTERNAL_ERROR",
      expect.objectContaining({ provider: "WOMPI" })
    );
  });

  // G. Two deliveries of the same event in sequence never double-apply —
  // the route layer must reflect exactly what applyProviderStatus reports,
  // never re-derive or override idempotency itself.
  it("G. dos entregas seguidas del mismo evento producen PROCESSED y luego IDEMPOTENT_DUPLICATE, nunca dos veces PROCESSED", async () => {
    const payment = fakePayment({ status: "APPROVED" });
    const applyProviderStatus = vi
      .fn()
      .mockResolvedValueOnce({ payment, project: null, wasNewTransition: true })
      .mockResolvedValueOnce({ payment, project: null, wasNewTransition: false });
    vi.doMock("@/lib/db/paymentsStore", () => ({ getPaymentByReference: vi.fn(async () => null) }));
    vi.doMock("@/lib/payments/service", () => ({ applyProviderStatus }));

    const { POST } = await import("@/app/api/payments/wompi/webhook/route");
    const first = await (await POST(buildRequest(buildEvent()))).json();
    const second = await (await POST(buildRequest(buildEvent()))).json();

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

  // Amount/currency mismatch must still be refused, unchanged — this path
  // is untouched by Fase 3B and must keep working exactly as before.
  it("rechaza por amount_mismatch cuando el Payment existente no coincide (comportamiento preexistente intacto)", async () => {
    vi.doMock("@/lib/db/paymentsStore", () => ({
      getPaymentByReference: vi.fn(async () => fakePayment({ amount: 999, currency: "COP" })),
    }));
    vi.doMock("@/lib/payments/service", () => ({ applyProviderStatus: vi.fn() }));

    const { POST } = await import("@/app/api/payments/wompi/webhook/route");
    const res = await POST(buildRequest(buildEvent({ amountInCents: 150_000_00 })));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json).toEqual({ ok: false, error: "amount_mismatch" });
  });
});
