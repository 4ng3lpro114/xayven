import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  readPayPalWebhookHeaders,
  extractOrderInfo,
  verifyPayPalWebhookSignature,
  PAYPAL_EVENT_STATUS_MAP,
  type PayPalWebhookHeaders,
} from "@/lib/payments/providers/paypalWebhook";
import { applyProviderStatus } from "@/lib/payments/service";
import {
  createClient as createPaymentsClient,
  createProject,
  createPayment,
  getProjectById,
  updatePayment,
} from "@/lib/db/paymentsStore";

// Mirrors wompiWebhook.test.ts: pure/near-pure payload-shape logic gets
// direct unit tests; the network-dependent signature check is exercised
// with a mocked fetch (PayPal's verification is a server-to-server API
// call, not a local HMAC, so there's no pure-function equivalent to test
// against — see providers/paypalWebhook.ts).

const HEADERS: PayPalWebhookHeaders = {
  transmissionId: "txn-id-1",
  transmissionTime: "2026-08-11T00:00:00Z",
  certUrl: "https://api.sandbox.paypal.com/cert",
  authAlgo: "SHA256withRSA",
  transmissionSig: "fake-sig",
};

describe("readPayPalWebhookHeaders", () => {
  it("reads all five required PayPal signature headers", () => {
    const headers = new Headers({
      "paypal-transmission-id": "a",
      "paypal-transmission-time": "b",
      "paypal-cert-url": "c",
      "paypal-auth-algo": "d",
      "paypal-transmission-sig": "e",
    });
    expect(readPayPalWebhookHeaders(headers)).toEqual({
      transmissionId: "a",
      transmissionTime: "b",
      certUrl: "c",
      authAlgo: "d",
      transmissionSig: "e",
    });
  });

  it("returns null when any single header is missing — e.g. a non-PayPal caller", () => {
    const headers = new Headers({
      "paypal-transmission-id": "a",
      "paypal-transmission-time": "b",
      "paypal-cert-url": "c",
      "paypal-auth-algo": "d",
      // transmission-sig omitted
    });
    expect(readPayPalWebhookHeaders(headers)).toBeNull();
  });

  it("returns null for a request with no PayPal headers at all", () => {
    expect(readPayPalWebhookHeaders(new Headers())).toBeNull();
  });
});

describe("extractOrderInfo", () => {
  it("reads the order id from supplementary_data for a PAYMENT.CAPTURE.* resource", () => {
    const resource = {
      id: "CAPTURE-1",
      custom_id: "payment-row-id",
      supplementary_data: { related_ids: { order_id: "ORDER-1" } },
    };
    expect(extractOrderInfo(resource)).toEqual({
      orderId: "ORDER-1",
      captureId: "CAPTURE-1",
      referenceId: "payment-row-id",
    });
  });

  it("falls back to resource.id for a CHECKOUT.ORDER.* resource with no supplementary_data", () => {
    const resource = {
      id: "ORDER-2",
      purchase_units: [{ reference_id: "XAYVEN-ref-2" }],
    };
    expect(extractOrderInfo(resource)).toEqual({
      orderId: "ORDER-2",
      captureId: "ORDER-2",
      referenceId: "XAYVEN-ref-2",
    });
  });

  it("prefers custom_id over purchase_units[0].reference_id when both are present", () => {
    const resource = {
      id: "CAPTURE-3",
      custom_id: "payment-row-id-3",
      supplementary_data: { related_ids: { order_id: "ORDER-3" } },
      purchase_units: [{ reference_id: "XAYVEN-ref-3" }],
    };
    expect(extractOrderInfo(resource)?.referenceId).toBe("payment-row-id-3");
  });

  it("returns null when no order id can be found anywhere in the resource", () => {
    expect(extractOrderInfo({ custom_id: "no-id-here" })).toBeNull();
  });

  it("returns a null referenceId (not a crash) when neither custom_id nor purchase_units is present", () => {
    expect(extractOrderInfo({ id: "ORDER-4" })).toEqual({
      orderId: "ORDER-4",
      captureId: "ORDER-4",
      referenceId: null,
    });
  });
});

describe("PAYPAL_EVENT_STATUS_MAP", () => {
  it("maps the events we act on to our own PaymentStatus", () => {
    expect(PAYPAL_EVENT_STATUS_MAP["PAYMENT.CAPTURE.COMPLETED"]).toBe("APPROVED");
    expect(PAYPAL_EVENT_STATUS_MAP["PAYMENT.CAPTURE.DENIED"]).toBe("DECLINED");
    expect(PAYPAL_EVENT_STATUS_MAP["PAYMENT.CAPTURE.DECLINED"]).toBe("DECLINED");
    expect(PAYPAL_EVENT_STATUS_MAP["PAYMENT.CAPTURE.REFUNDED"]).toBe("REFUNDED");
    expect(PAYPAL_EVENT_STATUS_MAP["CHECKOUT.ORDER.VOIDED"]).toBe("VOIDED");
  });

  it("has no entry for CHECKOUT.ORDER.APPROVED — approval alone never moves money", () => {
    expect(PAYPAL_EVENT_STATUS_MAP["CHECKOUT.ORDER.APPROVED"]).toBeUndefined();
  });

  it("has no entry for an unrecognized/future event type — must be ignored, not crash", () => {
    expect(PAYPAL_EVENT_STATUS_MAP["SOME.FUTURE.EVENT"]).toBeUndefined();
  });
});

describe("verifyPayPalWebhookSignature", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.PAYPAL_CLIENT_ID = "test-client-id";
    process.env.PAYPAL_CLIENT_SECRET = "test-client-secret";
    process.env.PAYPAL_ENV = "sandbox";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("refuses to verify (fails closed) when PAYPAL_WEBHOOK_ID isn't set — no network call made", async () => {
    delete process.env.PAYPAL_WEBHOOK_ID;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await verifyPayPalWebhookSignature(HEADERS, { event_type: "PAYMENT.CAPTURE.COMPLETED" });

    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns true when PayPal's verify-webhook-signature API reports SUCCESS", async () => {
    process.env.PAYPAL_WEBHOOK_ID = "WH-TEST-123";
    vi.stubGlobal("fetch", makeFakeVerifyFetch("SUCCESS"));

    const result = await verifyPayPalWebhookSignature(HEADERS, { event_type: "PAYMENT.CAPTURE.COMPLETED" });
    expect(result).toBe(true);
  });

  it("returns false when PayPal's API reports FAILURE — must never be treated as authentic", async () => {
    process.env.PAYPAL_WEBHOOK_ID = "WH-TEST-123";
    vi.stubGlobal("fetch", makeFakeVerifyFetch("FAILURE"));

    const result = await verifyPayPalWebhookSignature(HEADERS, { event_type: "PAYMENT.CAPTURE.COMPLETED" });
    expect(result).toBe(false);
  });

  it("returns false when the verification call itself fails (non-2xx)", async () => {
    process.env.PAYPAL_WEBHOOK_ID = "WH-TEST-123";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/oauth2/token")) {
          return jsonResponse({ access_token: "fake-token", expires_in: 3600 });
        }
        return jsonResponse({ error: "server_error" }, 500);
      })
    );

    const result = await verifyPayPalWebhookSignature(HEADERS, { event_type: "PAYMENT.CAPTURE.COMPLETED" });
    expect(result).toBe(false);
  });

  /** Simulates PayPal's OAuth token endpoint + the verify-webhook-signature
   *  endpoint so verifyPayPalWebhookSignature's real (non-mocked) HTTP
   *  logic runs end-to-end against a fake network. */
  function makeFakeVerifyFetch(verificationStatus: "SUCCESS" | "FAILURE") {
    return vi.fn(async (url: string) => {
      if (String(url).includes("/oauth2/token")) {
        return jsonResponse({ access_token: "fake-token", expires_in: 3600 });
      }
      if (String(url).includes("/notifications/verify-webhook-signature")) {
        return jsonResponse({ verification_status: verificationStatus });
      }
      throw new Error(`Unexpected fetch call in test: ${url}`);
    });
  }

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
});

describe("PayPal webhook → applyProviderStatus (idempotency, end to end)", () => {
  // The in-memory paymentsStore fallback is a module-global Map shared by
  // every test in this process (see lib/db/memoryStore.ts) — so each test
  // needs its OWN unique providerTransactionId, exactly like a real system
  // would never reuse a PayPal order id across two different orders.
  async function makeProjectWithPendingPayPalPayment(totalAmount: number) {
    const client = await createPaymentsClient({
      name: "Test Client",
      email: `t-${Date.now()}-${Math.random()}@example.com`,
    });
    const project = await createProject({ clientId: client.id, name: "Test Project", totalAmount, currency: "USD" });
    const payment = await createPayment({
      projectId: project.id,
      clientId: client.id,
      provider: "PAYPAL",
      reference: `XAYVEN-${project.id}-paypal-test`,
      amount: Math.round(totalAmount / 2),
      currency: "USD",
      paymentType: "DEPOSIT",
    });
    const orderId = `ORDER-E2E-${payment.id}`;
    // The order id is persisted onto the payment the moment checkout is
    // created (see service.ts persistProviderTransactionId) — before the
    // buyer ever reaches PayPal, and before any webhook can arrive.
    await updatePayment(payment.id, { providerTransactionId: orderId });
    return { project, payment, orderId };
  }

  /** Builds a realistic PAYMENT.CAPTURE.COMPLETED body per PayPal's
   *  documented shape and drives it through the same two functions the
   *  route handler uses. */
  function buildCaptureCompletedBody(orderId: string, referenceId: string) {
    return {
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: `CAPTURE-${orderId}`,
        custom_id: referenceId,
        supplementary_data: { related_ids: { order_id: orderId } },
        purchase_units: [{ reference_id: referenceId }],
        amount: { currency_code: "USD", value: "500.00" },
      },
    };
  }

  it("a valid, verified webhook approves the payment and updates the project's paidAmount exactly once", async () => {
    const { project, payment, orderId } = await makeProjectWithPendingPayPalPayment(1000);
    const body = buildCaptureCompletedBody(orderId, payment.id);

    const status = PAYPAL_EVENT_STATUS_MAP[body.event_type];
    const info = extractOrderInfo(body.resource);
    expect(info).not.toBeNull();

    const first = await applyProviderStatus({
      provider: "PAYPAL",
      providerTransactionId: info!.orderId,
      reportedStatus: status!,
      reference: payment.reference,
      rawPayload: body,
    });
    expect(first?.wasNewTransition).toBe(true);
    expect(first?.payment.status).toBe("APPROVED");

    const afterFirst = await getProjectById(project.id);
    expect(afterFirst?.paidAmount).toBe(500);

    // Same delivery redelivered (PayPal retries on non-2xx, or the return
    // page and the webhook both fire for the same capture) — must be a
    // pure no-op, not a second credit.
    const second = await applyProviderStatus({
      provider: "PAYPAL",
      providerTransactionId: info!.orderId,
      reportedStatus: status!,
      reference: payment.reference,
      rawPayload: body,
    });
    expect(second?.wasNewTransition).toBe(false);

    const afterSecond = await getProjectById(project.id);
    expect(afterSecond?.paidAmount).toBe(500); // unchanged, not 1000
  });

  it("a DECLINED-equivalent event never touches paidAmount", async () => {
    const { project, payment, orderId } = await makeProjectWithPendingPayPalPayment(1000);
    const body = {
      event_type: "PAYMENT.CAPTURE.DENIED",
      resource: {
        id: `CAPTURE-${orderId}`,
        custom_id: payment.id,
        supplementary_data: { related_ids: { order_id: orderId } },
      },
    };

    const status = PAYPAL_EVENT_STATUS_MAP[body.event_type];
    const info = extractOrderInfo(body.resource);

    const result = await applyProviderStatus({
      provider: "PAYPAL",
      providerTransactionId: info!.orderId,
      reportedStatus: status!,
      reference: payment.reference,
      rawPayload: body,
    });
    expect(result?.payment.status).toBe("DECLINED");

    const afterDecline = await getProjectById(project.id);
    expect(afterDecline?.paidAmount).toBe(0);
  });

  it("an unrecognized event type maps to no status — the route must acknowledge and ignore it, never guess", () => {
    const status = PAYPAL_EVENT_STATUS_MAP["CHECKOUT.ORDER.APPROVED"];
    expect(status).toBeUndefined();
    // (The route returns { ok: true, ignored: true } in this case — see
    // api/payments/paypal/webhook/route.ts — without ever calling
    // applyProviderStatus, so no test double-check is needed here beyond
    // confirming the map genuinely has no entry.)
  });
});
