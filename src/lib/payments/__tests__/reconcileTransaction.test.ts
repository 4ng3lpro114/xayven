import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PaymentProvider } from "@/lib/payments/provider";
import type { PaymentProviderName } from "@/lib/payments/types";

// Same registry-mocking technique as serviceCheckoutResume.test.ts — the
// single choke point service.ts uses to reach a provider — so this test
// exercises reconcileTransaction()'s own orchestration/logging without
// depending on Wompi's real HTTP behavior (already covered separately in
// wompiFetchTransactionStatus.test.ts).
const { fakeProviders } = vi.hoisted(() => ({
  fakeProviders: {} as Partial<Record<PaymentProviderName, PaymentProvider>>,
}));

vi.mock("@/lib/payments/registry", () => ({
  getProvider: (name: PaymentProviderName) => {
    const provider = fakeProviders[name];
    if (!provider) throw new Error(`reconcileTransaction.test: no fake provider registered for ${name}`);
    return provider;
  },
  listConfiguredProviders: () => Object.keys(fakeProviders) as PaymentProviderName[],
}));

import { reconcileTransaction } from "@/lib/payments/service";
import { createClient as createPaymentsClient, createProject, createPayment, getProjectById } from "@/lib/db/paymentsStore";

function makeFakeWompi(overrides: Partial<PaymentProvider> = {}): PaymentProvider {
  return {
    name: "WOMPI",
    isConfigured: () => true,
    createCheckout: vi.fn(),
    fetchTransactionStatus: vi.fn(async () => null),
    ...overrides,
  };
}

let infoSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fakeProviders.WOMPI = undefined;
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  infoSpy.mockRestore();
  warnSpy.mockRestore();
});

describe("reconcileTransaction — behavior preservation + logging", () => {
  it("successful reconciliation: applies APPROVED exactly as before, and emits the full log sequence", async () => {
    const client = await createPaymentsClient({
      name: "Reconcile Test Client",
      email: `reconcile-${Date.now()}-${Math.random()}@example.com`,
    });
    const project = await createProject({ clientId: client.id, name: "Reconcile Test Project", totalAmount: 2_000 });
    const payment = await createPayment({
      projectId: project.id,
      clientId: client.id,
      provider: "WOMPI",
      reference: "XAYVEN-RECON-0001",
      amount: 2_000,
      currency: "COP",
      paymentType: "FULL_PAYMENT",
    });

    fakeProviders.WOMPI = makeFakeWompi({
      fetchTransactionStatus: vi.fn(async () => ({
        transactionId: "wompi-recon-txn-1",
        reference: payment.reference,
        status: "APPROVED" as const,
        amountInProviderUnits: 200_000,
        currency: "COP",
        raw: {},
      })),
    });

    const result = await reconcileTransaction("WOMPI", "wompi-recon-txn-1");

    // Functional behavior — identical to what applyProviderStatus already
    // guarantees, just reached via reconcileTransaction() this time.
    expect(result?.wasNewTransition).toBe(true);
    expect(result?.payment.status).toBe("APPROVED");
    const updatedProject = await getProjectById(project.id);
    expect(updatedProject?.paidAmount).toBe(2_000);

    // Observability — the full happy-path sequence, in order, correlated
    // by the same transactionId/paymentId throughout.
    expect(infoSpy).toHaveBeenCalledWith(
      "[reconciliation] RECONCILIATION_STARTED",
      expect.objectContaining({ provider: "WOMPI", transactionId: "wompi-recon-txn-1" })
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "[reconciliation] PROVIDER_STATUS_RECEIVED",
      expect.objectContaining({
        provider: "WOMPI",
        transactionId: "wompi-recon-txn-1",
        reportedStatus: "APPROVED",
        reference: payment.reference,
      })
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "[reconciliation] RECONCILIATION_COMPLETED",
      expect.objectContaining({
        provider: "WOMPI",
        transactionId: "wompi-recon-txn-1",
        paymentId: result?.payment.id,
        finalStatus: "APPROVED",
        wasNewTransition: true,
      })
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("provider returns no status (e.g. fetchTransactionStatus() failed) — returns null exactly as before, logs RECONCILIATION_FAILED", async () => {
    fakeProviders.WOMPI = makeFakeWompi({ fetchTransactionStatus: vi.fn(async () => null) });

    const result = await reconcileTransaction("WOMPI", "wompi-recon-txn-2");
    expect(result).toBeNull();

    expect(infoSpy).toHaveBeenCalledWith(
      "[reconciliation] RECONCILIATION_STARTED",
      expect.objectContaining({ provider: "WOMPI", transactionId: "wompi-recon-txn-2" })
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[reconciliation] RECONCILIATION_FAILED",
      expect.objectContaining({
        provider: "WOMPI",
        transactionId: "wompi-recon-txn-2",
        reason: "no_status_from_provider",
      })
    );
  });

  it("provider status matches no known payment — returns null exactly as before, logs RECONCILIATION_FAILED/payment_not_found", async () => {
    fakeProviders.WOMPI = makeFakeWompi({
      fetchTransactionStatus: vi.fn(async () => ({
        transactionId: "wompi-recon-txn-3",
        reference: "XAYVEN-DOES-NOT-EXIST",
        status: "APPROVED" as const,
        amountInProviderUnits: 100_000,
        currency: "COP",
        raw: {},
      })),
    });

    const result = await reconcileTransaction("WOMPI", "wompi-recon-txn-3");
    expect(result).toBeNull();

    expect(warnSpy).toHaveBeenCalledWith(
      "[reconciliation] RECONCILIATION_FAILED",
      expect.objectContaining({
        provider: "WOMPI",
        transactionId: "wompi-recon-txn-3",
        reference: "XAYVEN-DOES-NOT-EXIST",
        reason: "payment_not_found",
      })
    );
  });
});
