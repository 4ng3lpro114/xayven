import { describe, it, expect, vi } from "vitest";
import { paypalProvider } from "@/lib/payments/providers/paypal";

// Regression coverage for the checkout-resumability fix: before this,
// service.ts always called createCheckout() on every render, which for
// PayPal meant a brand-new remote Order every refresh/retry. resumeCheckout
// is the piece that lets service.ts avoid that — see service.ts
// `tryResumeCheckout`/`syncProviderTransactionId` and
// serviceCheckoutResume.test.ts for the orchestration-level tests.
//
// Same mocking style as paypalWebhook.test.ts: vi.stubGlobal("fetch", ...),
// a fake that answers both the OAuth token call and the real API call.

describe("PayPalProvider.resumeCheckout", () => {
  const ORIGINAL_ENV = { ...process.env };

  function setEnv() {
    process.env.PAYPAL_CLIENT_ID = "test-client-id";
    process.env.PAYPAL_CLIENT_SECRET = "test-client-secret";
    process.env.PAYPAL_ENV = "sandbox";
  }

  function restoreEnv() {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  }

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  function stubOrderFetch(orderStatus: string, opts: { withApproveLink?: boolean } = {}) {
    const withApproveLink = opts.withApproveLink ?? true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/oauth2/token")) {
          return jsonResponse({ access_token: "fake-token", expires_in: 3600 });
        }
        if (String(url).includes("/v2/checkout/orders/")) {
          return jsonResponse({
            id: "ORDER-1",
            status: orderStatus,
            purchase_units: [{ reference_id: "REF-1", amount: { currency_code: "USD", value: "10.00" } }],
            links: withApproveLink
              ? [{ rel: "approve", href: "https://sandbox.paypal.com/checkoutnow?token=ORDER-1" }]
              : [],
          });
        }
        throw new Error(`Unexpected fetch call in test: ${url}`);
      })
    );
  }

  for (const status of ["CREATED", "SAVED", "APPROVED", "PAYER_ACTION_REQUIRED"]) {
    it(`reuses the order when status is ${status} — still actionable by the buyer`, async () => {
      setEnv();
      stubOrderFetch(status);
      try {
        const result = await paypalProvider.resumeCheckout("ORDER-1");
        expect(result).toEqual({
          mode: "redirect",
          url: "https://sandbox.paypal.com/checkoutnow?token=ORDER-1",
          providerTransactionId: "ORDER-1",
        });
      } finally {
        restoreEnv();
      }
    });
  }

  for (const status of ["COMPLETED", "VOIDED", "DECLINED"]) {
    it(`refuses to reuse the order when status is ${status} — terminal, must create a fresh one`, async () => {
      setEnv();
      stubOrderFetch(status);
      try {
        const result = await paypalProvider.resumeCheckout("ORDER-1");
        expect(result).toBeNull();
      } finally {
        restoreEnv();
      }
    });
  }

  it("returns null on a 404 (order not found / expired)", async () => {
    setEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/oauth2/token")) {
          return jsonResponse({ access_token: "fake-token", expires_in: 3600 });
        }
        return jsonResponse({ error: "NOT_FOUND" }, 404);
      })
    );
    try {
      const result = await paypalProvider.resumeCheckout("ORDER-GONE");
      expect(result).toBeNull();
    } finally {
      restoreEnv();
    }
  });

  it("returns null on a network error — never throws, caller falls back to creating a new order", async () => {
    setEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/oauth2/token")) {
          return jsonResponse({ access_token: "fake-token", expires_in: 3600 });
        }
        throw new Error("network down");
      })
    );
    try {
      const result = await paypalProvider.resumeCheckout("ORDER-1");
      expect(result).toBeNull();
    } finally {
      restoreEnv();
    }
  });

  it("returns null when the order is still actionable but has no approve link (defensive)", async () => {
    setEnv();
    stubOrderFetch("CREATED", { withApproveLink: false });
    try {
      const result = await paypalProvider.resumeCheckout("ORDER-1");
      expect(result).toBeNull();
    } finally {
      restoreEnv();
    }
  });

  it("returns null when PayPal isn't configured — never makes a network call", async () => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const result = await paypalProvider.resumeCheckout("ORDER-1");
      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      restoreEnv();
    }
  });
});
