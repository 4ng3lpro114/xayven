import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PaymentProvider, CheckoutResult } from "@/lib/payments/provider";
import type { PaymentProviderName } from "@/lib/payments/types";

// service.ts only ever reaches a provider through getProvider() (see
// registry.ts) — mocking that single choke point lets these tests exercise
// the real orchestration logic in initiateProjectPayment /
// buildCheckoutForExistingPayment (tryResumeCheckout / syncProviderTransactionId)
// without depending on PayPal's real HTTP behavior, which is already
// covered separately in paypalResumeCheckout.test.ts.
const { fakeProviders } = vi.hoisted(() => ({
  fakeProviders: {} as Partial<Record<PaymentProviderName, PaymentProvider>>,
}));

vi.mock("@/lib/payments/registry", () => ({
  getProvider: (name: PaymentProviderName) => {
    const provider = fakeProviders[name];
    if (!provider) throw new Error(`serviceCheckoutResume.test: no fake provider registered for ${name}`);
    return provider;
  },
  listConfiguredProviders: () => Object.keys(fakeProviders) as PaymentProviderName[],
}));

import { initiateProjectPayment, buildCheckoutForExistingPayment } from "@/lib/payments/service";
import {
  createClient as createPaymentsClient,
  createProject,
  createPayment,
  getPaymentById,
} from "@/lib/db/paymentsStore";
import { generatePaymentReference } from "@/lib/payments/reference";

function makeFakeProvider(overrides: Partial<PaymentProvider> = {}): PaymentProvider {
  return {
    name: "PAYPAL",
    isConfigured: () => true,
    createCheckout: vi.fn(),
    fetchTransactionStatus: vi.fn(async () => null),
    ...overrides,
  };
}

async function makeProjectAndClient() {
  const client = await createPaymentsClient({
    name: "Resume Test Client",
    email: `resume-${Date.now()}-${Math.random()}@example.com`,
  });
  const project = await createProject({ clientId: client.id, name: "Resume Test Project", totalAmount: 2_000_000 });
  return { client, project };
}

beforeEach(() => {
  for (const key of Object.keys(fakeProviders) as PaymentProviderName[]) {
    delete fakeProviders[key];
  }
});

describe("initiateProjectPayment — PayPal checkout resumability", () => {
  it("a second attempt with a still-actionable order reuses it — no second order created", async () => {
    const { client, project } = await makeProjectAndClient();

    const createCheckout = vi.fn(
      async (): Promise<CheckoutResult> => ({
        mode: "redirect",
        url: "https://paypal.test/approve/ORDER-A",
        providerTransactionId: "ORDER-A",
      })
    );
    const resumeCheckout = vi.fn(
      async (): Promise<CheckoutResult> => ({
        mode: "redirect",
        url: "https://paypal.test/approve/ORDER-A",
        providerTransactionId: "ORDER-A",
      })
    );
    fakeProviders.PAYPAL = makeFakeProvider({ createCheckout, resumeCheckout });

    const first = await initiateProjectPayment({
      project,
      client,
      paymentType: "DEPOSIT",
      provider: "PAYPAL",
      siteUrl: "https://xayven.test",
      locale: "es",
    });
    expect(createCheckout).toHaveBeenCalledTimes(1);
    expect(resumeCheckout).not.toHaveBeenCalled(); // no providerTransactionId existed yet
    expect(first.payment.providerTransactionId).toBe("ORDER-A");

    const second = await initiateProjectPayment({
      project,
      client,
      paymentType: "DEPOSIT",
      provider: "PAYPAL",
      siteUrl: "https://xayven.test",
      locale: "es",
    });

    expect(resumeCheckout).toHaveBeenCalledTimes(1);
    expect(resumeCheckout).toHaveBeenCalledWith("ORDER-A");
    expect(createCheckout).toHaveBeenCalledTimes(1); // still just one — no second order
    expect(second.checkout.mode).toBe("redirect");
    if (second.checkout.mode === "redirect") {
      expect(second.checkout.url).toBe("https://paypal.test/approve/ORDER-A");
    }
    expect(second.payment.providerTransactionId).toBe("ORDER-A");
  });

  it("a second attempt with a no-longer-reusable order creates a new one and re-syncs providerTransactionId", async () => {
    const { client, project } = await makeProjectAndClient();

    const createCheckout = vi
      .fn<() => Promise<CheckoutResult>>()
      .mockResolvedValueOnce({
        mode: "redirect",
        url: "https://paypal.test/approve/ORDER-A",
        providerTransactionId: "ORDER-A",
      })
      .mockResolvedValueOnce({
        mode: "redirect",
        url: "https://paypal.test/approve/ORDER-B",
        providerTransactionId: "ORDER-B",
      });
    const resumeCheckout = vi.fn(async () => null); // ORDER-A is dead (captured/voided/expired)
    fakeProviders.PAYPAL = makeFakeProvider({ createCheckout, resumeCheckout });

    const first = await initiateProjectPayment({
      project,
      client,
      paymentType: "DEPOSIT",
      provider: "PAYPAL",
      siteUrl: "https://xayven.test",
      locale: "es",
    });
    expect(first.payment.providerTransactionId).toBe("ORDER-A");

    const second = await initiateProjectPayment({
      project,
      client,
      paymentType: "DEPOSIT",
      provider: "PAYPAL",
      siteUrl: "https://xayven.test",
      locale: "es",
    });

    expect(resumeCheckout).toHaveBeenCalledWith("ORDER-A");
    expect(createCheckout).toHaveBeenCalledTimes(2); // a real new order was created
    if (second.checkout.mode === "redirect") {
      expect(second.checkout.url).toBe("https://paypal.test/approve/ORDER-B");
    }
    // The regression this fixes: the Payment must now point at the order
    // that's actually live, never stuck on the first, abandoned one.
    expect(second.payment.providerTransactionId).toBe("ORDER-B");

    const persisted = await getPaymentById(second.payment.id);
    expect(persisted?.providerTransactionId).toBe("ORDER-B");
  });

  it("Wompi's widget-mode checkout is never touched by this mechanism — providerTransactionId stays null", async () => {
    const { client, project } = await makeProjectAndClient();

    const createCheckout = vi.fn(
      async (): Promise<CheckoutResult> => ({
        mode: "widget",
        scriptSrc: "https://checkout.wompi.co/widget.js",
        config: {
          currency: "COP",
          amountInCents: 100_000_00,
          reference: "fake-ref",
          publicKey: "pub_test_fake",
          signature: { integrity: "fake-integrity" },
          redirectUrl: "https://xayven.test/return",
        },
      })
    );
    // Deliberately no resumeCheckout — mirrors the real WompiProvider, which
    // doesn't implement the optional method at all.
    fakeProviders.WOMPI = makeFakeProvider({ name: "WOMPI", createCheckout, resumeCheckout: undefined });

    await initiateProjectPayment({
      project,
      client,
      paymentType: "DEPOSIT",
      provider: "WOMPI",
      siteUrl: "https://xayven.test",
      locale: "es",
    });
    const second = await initiateProjectPayment({
      project,
      client,
      paymentType: "DEPOSIT",
      provider: "WOMPI",
      siteUrl: "https://xayven.test",
      locale: "es",
    });

    expect(createCheckout).toHaveBeenCalledTimes(2); // Wompi re-renders freely, exactly like before
    expect(second.payment.providerTransactionId).toBeNull();

    const persisted = await getPaymentById(second.payment.id);
    expect(persisted?.providerTransactionId).toBeNull();
  });
});

describe("buildCheckoutForExistingPayment — same resumability protection (maintenance flow)", () => {
  it("reuses a still-actionable PayPal order across repeated page loads", async () => {
    const { client, project } = await makeProjectAndClient();
    let payment = await createPayment({
      projectId: project.id,
      clientId: client.id,
      provider: "PAYPAL",
      reference: generatePaymentReference(project.id),
      amount: 200_000,
      currency: "USD",
      paymentType: "MAINTENANCE",
    });

    const createCheckout = vi.fn(
      async (): Promise<CheckoutResult> => ({
        mode: "redirect",
        url: "https://paypal.test/approve/ORDER-M1",
        providerTransactionId: "ORDER-M1",
      })
    );
    const resumeCheckout = vi.fn(
      async (): Promise<CheckoutResult> => ({
        mode: "redirect",
        url: "https://paypal.test/approve/ORDER-M1",
        providerTransactionId: "ORDER-M1",
      })
    );
    fakeProviders.PAYPAL = makeFakeProvider({ createCheckout, resumeCheckout });

    await buildCheckoutForExistingPayment({
      payment,
      project,
      client,
      siteUrl: "https://xayven.test",
      locale: "es",
    });
    expect(createCheckout).toHaveBeenCalledTimes(1);

    // Simulate a fresh page load: re-fetch from the DB, exactly like the
    // real maintenance pay page does on every render.
    payment = (await getPaymentById(payment.id))!;
    expect(payment.providerTransactionId).toBe("ORDER-M1");

    await buildCheckoutForExistingPayment({
      payment,
      project,
      client,
      siteUrl: "https://xayven.test",
      locale: "es",
    });

    expect(resumeCheckout).toHaveBeenCalledWith("ORDER-M1");
    expect(createCheckout).toHaveBeenCalledTimes(1); // no second order
  });

  it("creates and re-syncs to a new order once the previous one is no longer reusable", async () => {
    const { client, project } = await makeProjectAndClient();
    let payment = await createPayment({
      projectId: project.id,
      clientId: client.id,
      provider: "PAYPAL",
      reference: generatePaymentReference(project.id),
      amount: 200_000,
      currency: "USD",
      paymentType: "MAINTENANCE",
    });

    const createCheckout = vi
      .fn<() => Promise<CheckoutResult>>()
      .mockResolvedValueOnce({
        mode: "redirect",
        url: "https://paypal.test/approve/ORDER-M1",
        providerTransactionId: "ORDER-M1",
      })
      .mockResolvedValueOnce({
        mode: "redirect",
        url: "https://paypal.test/approve/ORDER-M2",
        providerTransactionId: "ORDER-M2",
      });
    const resumeCheckout = vi.fn(async () => null);
    fakeProviders.PAYPAL = makeFakeProvider({ createCheckout, resumeCheckout });

    await buildCheckoutForExistingPayment({ payment, project, client, siteUrl: "https://xayven.test", locale: "es" });
    payment = (await getPaymentById(payment.id))!;
    expect(payment.providerTransactionId).toBe("ORDER-M1");

    await buildCheckoutForExistingPayment({ payment, project, client, siteUrl: "https://xayven.test", locale: "es" });

    const persisted = await getPaymentById(payment.id);
    expect(persisted?.providerTransactionId).toBe("ORDER-M2"); // never stuck on ORDER-M1
    expect(createCheckout).toHaveBeenCalledTimes(2);
  });
});
