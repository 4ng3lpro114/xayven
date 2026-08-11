import { describe, it, expect } from "vitest";
import {
  computeAllowedAmount,
  applyProviderStatus,
  PaymentAuthorizationError,
} from "@/lib/payments/service";
import {
  createClient as createPaymentsClient,
  createProject,
  createPayment,
  getProjectById,
} from "@/lib/db/paymentsStore";
import type { Project } from "@/lib/payments/types";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// paymentsStore transparently uses its in-memory fallback — these are
// real (if ephemeral) read/write round-trips, not mocks.

async function makeProject(totalAmount: number): Promise<Project> {
  const client = await createPaymentsClient({ name: "Test Client", email: `t-${Date.now()}-${Math.random()}@example.com` });
  return createProject({ clientId: client.id, name: "Test Project", totalAmount });
}

describe("computeAllowedAmount", () => {
  it("DEPOSIT is 50% of total when nothing has been paid", () => {
    const project: Project = { ...blankProject(), totalAmount: 3_000_000, paidAmount: 0 };
    expect(computeAllowedAmount(project, "DEPOSIT")).toBe(1_500_000);
  });

  it("rejects DEPOSIT if something has already been paid", () => {
    const project: Project = { ...blankProject(), totalAmount: 3_000_000, paidAmount: 1_500_000 };
    expect(() => computeAllowedAmount(project, "DEPOSIT")).toThrow(PaymentAuthorizationError);
  });

  it("BALANCE is whatever remains, only once a deposit exists", () => {
    const project: Project = { ...blankProject(), totalAmount: 3_000_000, paidAmount: 1_500_000 };
    expect(computeAllowedAmount(project, "BALANCE")).toBe(1_500_000);
  });

  it("rejects BALANCE before any deposit", () => {
    const project: Project = { ...blankProject(), totalAmount: 3_000_000, paidAmount: 0 };
    expect(() => computeAllowedAmount(project, "BALANCE")).toThrow(PaymentAuthorizationError);
  });

  it("FULL_PAYMENT is the total, only when nothing has been paid", () => {
    const project: Project = { ...blankProject(), totalAmount: 3_000_000, paidAmount: 0 };
    expect(computeAllowedAmount(project, "FULL_PAYMENT")).toBe(3_000_000);
  });

  it("rejects FULL_PAYMENT if a partial payment already exists", () => {
    const project: Project = { ...blankProject(), totalAmount: 3_000_000, paidAmount: 500_000 };
    expect(() => computeAllowedAmount(project, "FULL_PAYMENT")).toThrow(PaymentAuthorizationError);
  });

  it("rejects everything once the project is fully paid — no accidental overpay", () => {
    const project: Project = { ...blankProject(), totalAmount: 3_000_000, paidAmount: 3_000_000 };
    expect(() => computeAllowedAmount(project, "DEPOSIT")).toThrow(PaymentAuthorizationError);
    expect(() => computeAllowedAmount(project, "BALANCE")).toThrow(PaymentAuthorizationError);
    expect(() => computeAllowedAmount(project, "FULL_PAYMENT")).toThrow(PaymentAuthorizationError);
  });

  it("never derives an amount from anything but the stored project — the function takes no amount input at all", () => {
    // Architectural guarantee, not a runtime check: computeAllowedAmount's
    // signature is (project, paymentType) => number. There is no third
    // parameter a caller could use to smuggle in a client-supplied amount.
    expect(computeAllowedAmount.length).toBe(2);
  });
});

describe("applyProviderStatus (idempotency + project accounting)", () => {
  it("APPROVED increases project.paidAmount exactly once, even if the webhook fires twice", async () => {
    const project = await makeProject(3_000_000);
    const payment = await createPayment({
      projectId: project.id,
      clientId: project.clientId,
      provider: "WOMPI",
      reference: "XAYVEN-TEST-0001",
      amount: 1_500_000,
      currency: "COP",
      paymentType: "DEPOSIT",
    });

    const first = await applyProviderStatus({
      provider: "WOMPI",
      providerTransactionId: "wompi-txn-1",
      reportedStatus: "APPROVED",
      reference: payment.reference,
      rawPayload: {},
    });
    expect(first?.wasNewTransition).toBe(true);
    expect(first?.payment.status).toBe("APPROVED");

    const afterFirst = await getProjectById(project.id);
    expect(afterFirst?.paidAmount).toBe(1_500_000);

    // Exact same delivery again (Wompi retries on any non-2xx, or simply
    // redelivers) — must be a pure no-op.
    const second = await applyProviderStatus({
      provider: "WOMPI",
      providerTransactionId: "wompi-txn-1",
      reportedStatus: "APPROVED",
      reference: payment.reference,
      rawPayload: {},
    });
    expect(second?.wasNewTransition).toBe(false);

    const afterSecond = await getProjectById(project.id);
    expect(afterSecond?.paidAmount).toBe(1_500_000); // unchanged, not 3,000,000
  });

  it("DECLINED never touches project.paidAmount", async () => {
    const project = await makeProject(3_000_000);
    const payment = await createPayment({
      projectId: project.id,
      clientId: project.clientId,
      provider: "WOMPI",
      reference: "XAYVEN-TEST-0002",
      amount: 1_500_000,
      currency: "COP",
      paymentType: "DEPOSIT",
    });

    const result = await applyProviderStatus({
      provider: "WOMPI",
      providerTransactionId: "wompi-txn-2",
      reportedStatus: "DECLINED",
      reference: payment.reference,
      rawPayload: {},
    });

    expect(result?.payment.status).toBe("DECLINED");
    const afterDecline = await getProjectById(project.id);
    expect(afterDecline?.paidAmount).toBe(0);
  });

  it("ERROR and VOIDED are treated as terminal, non-financial outcomes", async () => {
    const project = await makeProject(1_000_000);

    for (const [status, ref, txn] of [
      ["ERROR", "XAYVEN-TEST-0003", "wompi-txn-3"],
      ["VOIDED", "XAYVEN-TEST-0004", "wompi-txn-4"],
    ] as const) {
      const payment = await createPayment({
        projectId: project.id,
        clientId: project.clientId,
        provider: "WOMPI",
        reference: ref,
        amount: 500_000,
        currency: "COP",
        paymentType: "DEPOSIT",
      });
      const result = await applyProviderStatus({
        provider: "WOMPI",
        providerTransactionId: txn,
        reportedStatus: status,
        reference: payment.reference,
        rawPayload: {},
      });
      expect(result?.payment.status).toBe(status);
    }

    const finalProject = await getProjectById(project.id);
    expect(finalProject?.paidAmount).toBe(0);
  });

  it("never moves a payment out of a terminal status once reached", async () => {
    const project = await makeProject(1_000_000);
    const payment = await createPayment({
      projectId: project.id,
      clientId: project.clientId,
      provider: "WOMPI",
      reference: "XAYVEN-TEST-0005",
      amount: 500_000,
      currency: "COP",
      paymentType: "DEPOSIT",
    });

    await applyProviderStatus({
      provider: "WOMPI",
      providerTransactionId: "wompi-txn-5",
      reportedStatus: "DECLINED",
      reference: payment.reference,
      rawPayload: {},
    });

    // A late/out-of-order APPROVED for the same transaction must not
    // resurrect a declined payment.
    const late = await applyProviderStatus({
      provider: "WOMPI",
      providerTransactionId: "wompi-txn-5",
      reportedStatus: "APPROVED",
      reference: payment.reference,
      rawPayload: {},
    });
    expect(late?.wasNewTransition).toBe(false);
    expect(late?.payment.status).toBe("DECLINED");
  });

  it("returns null for a transaction/reference matching no known payment", async () => {
    const result = await applyProviderStatus({
      provider: "WOMPI",
      providerTransactionId: "wompi-txn-unknown",
      reportedStatus: "APPROVED",
      reference: "XAYVEN-DOES-NOT-EXIST",
      rawPayload: {},
    });
    expect(result).toBeNull();
  });

  it("caps project.paidAmount at totalAmount even if payments would otherwise overshoot it", async () => {
    const project = await makeProject(1_000_000);
    const payment = await createPayment({
      projectId: project.id,
      clientId: project.clientId,
      provider: "WOMPI",
      reference: "XAYVEN-TEST-0006",
      amount: 1_000_000, // FULL_PAYMENT-sized
      currency: "COP",
      paymentType: "FULL_PAYMENT",
    });

    await applyProviderStatus({
      provider: "WOMPI",
      providerTransactionId: "wompi-txn-6",
      reportedStatus: "APPROVED",
      reference: payment.reference,
      rawPayload: {},
    });

    const stray = await createPayment({
      projectId: project.id,
      clientId: project.clientId,
      provider: "WOMPI",
      reference: "XAYVEN-TEST-0006B",
      amount: 500_000,
      currency: "COP",
      paymentType: "DEPOSIT",
    });
    await applyProviderStatus({
      provider: "WOMPI",
      providerTransactionId: "wompi-txn-6b",
      reportedStatus: "APPROVED",
      reference: stray.reference,
      rawPayload: {},
    });

    const finalProject = await getProjectById(project.id);
    expect(finalProject?.paidAmount).toBe(1_000_000); // never 1,500,000
  });
});

function blankProject(): Project {
  return {
    id: "test-project-id",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    clientId: "test-client-id",
    name: "Test Project",
    status: "awaiting_payment",
    currency: "COP",
    totalAmount: 0,
    paidAmount: 0,
    portalToken: "test-token",
  };
}
