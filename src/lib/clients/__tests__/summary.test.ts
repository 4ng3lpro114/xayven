import { describe, it, expect } from "vitest";
import { buildClientSummaries } from "@/lib/clients/summary";
import type { Conversation } from "@/lib/db/types";
import type { Client, Payment, Project } from "@/lib/payments/types";

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "client-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    name: "Cliente de prueba",
    email: "cliente@example.com",
    phone: null,
    ...overrides,
  };
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv-1",
    sessionId: "session-1",
    locale: "es",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "active",
    messages: [],
    clientId: "client-1",
    visitorName: null,
    visitorEmail: null,
    visitorPhone: null,
    company: null,
    website: null,
    projectType: null,
    need: null,
    goal: null,
    budget: null,
    urgency: null,
    leadScore: 0,
    leadStatus: "exploring",
    aiSummary: null,
    consentStatus: "pending",
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    clientId: "client-1",
    name: "Proyecto de prueba",
    status: "awaiting_payment",
    currency: "COP",
    totalAmount: 1000000,
    paidAmount: 0,
    portalToken: "token-1",
    ...overrides,
  };
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "payment-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    projectId: "project-1",
    clientId: "client-1",
    provider: "WOMPI",
    providerTransactionId: null,
    reference: "REF-1",
    amount: 500000,
    currency: "COP",
    status: "APPROVED",
    paymentType: "DEPOSIT",
    metadata: {},
    ...overrides,
  };
}

describe("buildClientSummaries", () => {
  it("cliente sin ninguna relación → conteos en 0, importance normal, latestActivity null", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [],
      projects: [],
      payments: [],
    });

    const summary = summaries.get("client-1")!;
    expect(summary.conversationsCount).toBe(0);
    expect(summary.projectsCount).toBe(0);
    expect(summary.hasProjects).toBe(false);
    expect(summary.hasPayments).toBe(false);
    expect(summary.leadStatus).toBeNull();
    expect(summary.leadScore).toBeNull();
    expect(summary.latestActivity).toBeNull();
    expect(summary.importance).toBe("normal");
  });

  it("varias conversaciones → leadStatus/leadScore vienen de la más reciente (por updatedAt), no la primera ni la de score más alto", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [
        makeConversation({ id: "old", updatedAt: "2026-01-01T00:00:00.000Z", leadScore: 90, leadStatus: "hot" }),
        makeConversation({ id: "new", updatedAt: "2026-06-01T00:00:00.000Z", leadScore: 10, leadStatus: "exploring" }),
      ],
      projects: [],
      payments: [],
    });

    const summary = summaries.get("client-1")!;
    expect(summary.conversationsCount).toBe(2);
    expect(summary.leadStatus).toBe("exploring");
    expect(summary.leadScore).toBe(10);
  });

  it("múltiples monedas NUNCA se suman — quedan separadas por currency", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [],
      projects: [
        makeProject({ id: "p-cop", currency: "COP", totalAmount: 3_000_000, paidAmount: 3_000_000 }),
        makeProject({ id: "p-usd", currency: "USD", totalAmount: 1000, paidAmount: 500 }),
      ],
      payments: [],
    });

    const summary = summaries.get("client-1")!;
    expect(summary.paidAmount).toEqual({ COP: 3_000_000, USD: 500 });
    expect(summary.pendingAmount).toEqual({ COP: 0, USD: 500 });
    // Explícitamente NO debe existir una suma cruzada tipo 3.000.500.
    expect(Object.values(summary.paidAmount)).not.toContain(3_000_500);
  });

  it("última actividad correcta — toma el máximo entre conversaciones, proyectos y pagos", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [makeConversation({ updatedAt: "2026-01-01T00:00:00.000Z" })],
      projects: [makeProject({ updatedAt: "2026-03-01T00:00:00.000Z" })],
      payments: [makePayment({ updatedAt: "2026-02-01T00:00:00.000Z" })],
    });

    const summary = summaries.get("client-1")!;
    expect(summary.latestActivity).toBe("2026-03-01T00:00:00.000Z");
  });

  it("varias actividades de un mismo tipo se cuentan todas", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [makeConversation({ id: "c1" }), makeConversation({ id: "c2" })],
      projects: [makeProject({ id: "p1" }), makeProject({ id: "p2" }), makeProject({ id: "p3" })],
      payments: [makePayment({ id: "pay1" })],
    });

    const summary = summaries.get("client-1")!;
    expect(summary.conversationsCount).toBe(2);
    expect(summary.projectsCount).toBe(3);
    expect(summary.hasPayments).toBe(true);
  });

  it("cliente con pago registrado → importance protected (propagado desde classifyClientImportance)", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [],
      projects: [],
      payments: [makePayment()],
    });

    expect(summaries.get("client-1")!.importance).toBe("protected");
  });

  it("solo agrega datos del clientId correspondiente — no mezcla clientes distintos", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient({ id: "client-1" }), makeClient({ id: "client-2", email: "otro@example.com" })],
      conversations: [makeConversation({ clientId: "client-1" })],
      projects: [makeProject({ clientId: "client-2" })],
      payments: [],
    });

    expect(summaries.get("client-1")!.conversationsCount).toBe(1);
    expect(summaries.get("client-1")!.projectsCount).toBe(0);
    expect(summaries.get("client-2")!.conversationsCount).toBe(0);
    expect(summaries.get("client-2")!.projectsCount).toBe(1);
  });

  it("ignora conversaciones sin client_id (no convertidas) — nunca las cuelga del primer cliente por error", () => {
    const summaries = buildClientSummaries({
      clients: [makeClient()],
      conversations: [makeConversation({ clientId: null })],
      projects: [],
      payments: [],
    });

    expect(summaries.get("client-1")!.conversationsCount).toBe(0);
  });
});
