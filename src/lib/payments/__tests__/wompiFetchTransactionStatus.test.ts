import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { wompiProvider } from "@/lib/payments/providers/wompi";

/**
 * Payment Reconciliation Observability phase. Before this, every one of
 * fetchTransactionStatus()'s failure branches was completely silent (a
 * bare `return null`, or — for a fetch()/res.json() throw — an uncaught
 * exception with no diagnostic trail at all). These tests exist to prove
 * two things at once for every branch: (1) the actual return value/throw
 * behavior is byte-for-byte unchanged from before this phase, and (2) a
 * `[reconciliation] PROVIDER_LOOKUP_FAILED` log now fires with a `reason`
 * that lets production logs distinguish the branches, and never contains
 * the private key or any other secret.
 */

const ORIGINAL_ENV = { ...process.env };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  delete process.env.WOMPI_PRIVATE_KEY;
  delete process.env.WOMPI_ENV;
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  warnSpy.mockRestore();
});

describe("WompiProvider.fetchTransactionStatus — behavior preservation + logging", () => {
  it("not configured — returns null exactly as before, logs PROVIDER_LOOKUP_FAILED/not_configured, never logs the key itself", async () => {
    const result = await wompiProvider.fetchTransactionStatus("txn-1");
    expect(result).toBeNull();

    expect(warnSpy).toHaveBeenCalledWith(
      "[reconciliation] PROVIDER_LOOKUP_FAILED",
      expect.objectContaining({ provider: "WOMPI", transactionId: "txn-1", reason: "not_configured" })
    );
    const loggedText = JSON.stringify(warnSpy.mock.calls);
    expect(loggedText).not.toContain("WOMPI_PRIVATE_KEY");
  });

  it("fetch() throws — re-throws the exact same error (unchanged), logs PROVIDER_LOOKUP_FAILED/fetch_failed without the key", async () => {
    process.env.WOMPI_PRIVATE_KEY = "test_private_FAKEKEYFORTESTSONLY0000";
    const networkError = new Error("network down");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw networkError;
      })
    );

    await expect(wompiProvider.fetchTransactionStatus("txn-2")).rejects.toBe(networkError);

    expect(warnSpy).toHaveBeenCalledWith(
      "[reconciliation] PROVIDER_LOOKUP_FAILED",
      expect.objectContaining({
        provider: "WOMPI",
        transactionId: "txn-2",
        reason: "fetch_failed",
        message: "network down",
      })
    );
    const loggedText = JSON.stringify(warnSpy.mock.calls);
    expect(loggedText).not.toContain("FAKEKEYFORTESTSONLY");
  });

  it("HTTP !ok — returns null exactly as before, logs PROVIDER_LOOKUP_FAILED/http_error with the real status code", async () => {
    process.env.WOMPI_PRIVATE_KEY = "test_private_FAKEKEYFORTESTSONLY0000";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "not found" }, 404)));

    const result = await wompiProvider.fetchTransactionStatus("txn-3");
    expect(result).toBeNull();

    expect(warnSpy).toHaveBeenCalledWith(
      "[reconciliation] PROVIDER_LOOKUP_FAILED",
      expect.objectContaining({
        provider: "WOMPI",
        transactionId: "txn-3",
        reason: "http_error",
        httpStatus: 404,
      })
    );
  });

  it("malformed JSON body — re-throws the exact same error (unchanged), logs PROVIDER_LOOKUP_FAILED/invalid_json", async () => {
    process.env.WOMPI_PRIVATE_KEY = "test_private_FAKEKEYFORTESTSONLY0000";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not json", { status: 200 }))
    );

    await expect(wompiProvider.fetchTransactionStatus("txn-4")).rejects.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      "[reconciliation] PROVIDER_LOOKUP_FAILED",
      expect.objectContaining({ provider: "WOMPI", transactionId: "txn-4", reason: "invalid_json" })
    );
  });

  it("response missing transaction.id — returns null exactly as before, logs PROVIDER_LOOKUP_FAILED/missing_transaction_in_response", async () => {
    process.env.WOMPI_PRIVATE_KEY = "test_private_FAKEKEYFORTESTSONLY0000";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ data: {} }, 200)));

    const result = await wompiProvider.fetchTransactionStatus("txn-5");
    expect(result).toBeNull();

    expect(warnSpy).toHaveBeenCalledWith(
      "[reconciliation] PROVIDER_LOOKUP_FAILED",
      expect.objectContaining({
        provider: "WOMPI",
        transactionId: "txn-5",
        reason: "missing_transaction_in_response",
      })
    );
  });

  it("success — returns the parsed status exactly as before, does not log any failure event", async () => {
    process.env.WOMPI_PRIVATE_KEY = "test_private_FAKEKEYFORTESTSONLY0000";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            data: {
              id: "wompi-txn-real",
              status: "APPROVED",
              reference: "XAYVEN-abc-123",
              amount_in_cents: 200_000,
              currency: "COP",
            },
          },
          200
        )
      )
    );

    const result = await wompiProvider.fetchTransactionStatus("txn-6");
    expect(result).toEqual({
      transactionId: "wompi-txn-real",
      reference: "XAYVEN-abc-123",
      status: "APPROVED",
      amountInProviderUnits: 200_000,
      currency: "COP",
      raw: {
        id: "wompi-txn-real",
        status: "APPROVED",
        reference: "XAYVEN-abc-123",
        amount_in_cents: 200_000,
        currency: "COP",
      },
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
