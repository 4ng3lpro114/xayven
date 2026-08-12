import { describe, it, expect } from "vitest";
import {
  buildClientsStats,
  buildConversionStats,
  buildFinanceStats,
  buildLeadsStats,
  buildNewClientsSeries,
  buildProjectsStats,
  buildRevenuePeriodStats,
  buildRevenueSeries,
  buildStatisticsSnapshot,
} from "@/lib/statistics/aggregate";
import type { Conversation } from "@/lib/db/types";
import type { Client, Payment, Project } from "@/lib/payments/types";

const NOW = new Date("2026-08-12T12:00:00.000Z");

function iso(daysAgo: number): string {
  return new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "client-1",
    createdAt: iso(0),
    updatedAt: iso(0),
    name: "Cliente",
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
    createdAt: iso(0),
    updatedAt: iso(0),
    status: "active",
    messages: [],
    clientId: null,
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
    createdAt: iso(0),
    updatedAt: iso(0),
    clientId: "client-1",
    name: "Proyecto",
    status: "awaiting_payment",
    currency: "COP",
    totalAmount: 1_000_000,
    paidAmount: 0,
    portalToken: "token-1",
    ...overrides,
  };
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "payment-1",
    createdAt: iso(0),
    updatedAt: iso(0),
    projectId: "project-1",
    clientId: "client-1",
    provider: "WOMPI",
    providerTransactionId: null,
    reference: "REF-1",
    amount: 500_000,
    currency: "COP",
    status: "APPROVED",
    paymentType: "DEPOSIT",
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

describe("buildClientsStats", () => {
  it("cuenta el total y los nuevos del período por separado", () => {
    const clients = [
      makeClient({ id: "a", createdAt: iso(2) }), // dentro de 7d
      makeClient({ id: "b", createdAt: iso(40) }), // fuera de 7d
    ];
    const stats = buildClientsStats(clients, "7d", NOW);
    expect(stats.totalAllTime).toBe(2);
    expect(stats.newInPeriod).toBe(1);
  });

  it("crecimiento vs. período anterior: positivo cuando hay más clientes nuevos que antes", () => {
    const clients = [
      makeClient({ id: "a", createdAt: iso(2) }), // período actual (últimos 7d)
      makeClient({ id: "b", createdAt: iso(2) }),
      makeClient({ id: "c", createdAt: iso(10) }), // período anterior (7-14d atrás)
    ];
    const stats = buildClientsStats(clients, "7d", NOW);
    expect(stats.newInPreviousPeriod).toBe(1);
    expect(stats.growthPct).toBe(100); // de 1 a 2 = +100%
  });

  it("crecimiento es null (no inventado) cuando el período anterior tuvo 0 clientes", () => {
    const clients = [makeClient({ id: "a", createdAt: iso(2) })];
    const stats = buildClientsStats(clients, "7d", NOW);
    expect(stats.newInPreviousPeriod).toBe(0);
    expect(stats.growthPct).toBeNull();
  });

  it("período 'all' → sin período anterior, growthPct siempre null", () => {
    const clients = [makeClient({ createdAt: iso(500) })];
    const stats = buildClientsStats(clients, "all", NOW);
    expect(stats.newInPreviousPeriod).toBeNull();
    expect(stats.growthPct).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Proyectos
// ---------------------------------------------------------------------------

describe("buildProjectsStats", () => {
  it("clasifica correctamente cada proyecto por etapa", () => {
    const projects = [
      makeProject({ id: "p1", status: "completed" }),
      makeProject({ id: "p2", status: "active" }),
      makeProject({ id: "p3", status: "in_progress" }),
      makeProject({ id: "p4", status: "lead" }),
      makeProject({ id: "p5", status: "cancelled" }),
    ];
    const stats = buildProjectsStats(projects);
    expect(stats.byStage.completed).toBe(1);
    expect(stats.byStage.in_progress).toBe(2);
    expect(stats.byStage.pending).toBe(1);
    expect(stats.byStage.cancelled).toBe(1);
    expect(stats.totalAllTime).toBe(5);
  });

  it("valor pendiente excluye proyectos cancelados", () => {
    const projects = [
      makeProject({ id: "p1", status: "awaiting_payment", totalAmount: 1000, paidAmount: 0 }),
      makeProject({ id: "p2", status: "cancelled", totalAmount: 2000, paidAmount: 0 }),
    ];
    const stats = buildProjectsStats(projects);
    expect(stats.pendingByCurrency.COP).toBe(1000); // no 3000
  });

  it("valor contratado suma TODOS los proyectos, incluidos los cancelados", () => {
    const projects = [
      makeProject({ id: "p1", totalAmount: 1000 }),
      makeProject({ id: "p2", status: "cancelled", totalAmount: 2000 }),
    ];
    expect(buildProjectsStats(projects).contractedByCurrency.COP).toBe(3000);
  });
});

// ---------------------------------------------------------------------------
// Finanzas — ingresos APPROVED
// ---------------------------------------------------------------------------

describe("buildFinanceStats", () => {
  it("dinero recibido = solo pagos APPROVED, excluye PENDING/DECLINED/ERROR/VOIDED/REFUNDED", () => {
    const payments = [
      makePayment({ id: "1", status: "APPROVED", amount: 500 }),
      makePayment({ id: "2", status: "PENDING", amount: 999 }),
      makePayment({ id: "3", status: "DECLINED", amount: 999 }),
      makePayment({ id: "4", status: "ERROR", amount: 999 }),
      makePayment({ id: "5", status: "VOIDED", amount: 999 }),
      makePayment({ id: "6", status: "REFUNDED", amount: 999 }),
    ];
    const finance = buildFinanceStats([], payments);
    expect(finance.receivedByCurrency.COP).toBe(500);
    expect(finance.approvedPaymentsCount).toBe(1);
  });

  it("incluye pagos MAINTENANCE en el dinero recibido (nunca depende de projects.paid_amount)", () => {
    const payments = [makePayment({ status: "APPROVED", paymentType: "MAINTENANCE", amount: 300 })];
    // Ningún proyecto — si dependiera de projects.paid_amount, sería 0.
    const finance = buildFinanceStats([], payments);
    expect(finance.receivedByCurrency.COP).toBe(300);
  });

  it("ticket promedio se calcula solo sobre pagos aprobados", () => {
    const payments = [
      makePayment({ id: "1", status: "APPROVED", amount: 100 }),
      makePayment({ id: "2", status: "APPROVED", amount: 300 }),
      makePayment({ id: "3", status: "DECLINED", amount: 10_000 }),
    ];
    expect(buildFinanceStats([], payments).averageApprovedTicketByCurrency.COP).toBe(200);
  });

  it("cuenta pagos por cada estado real", () => {
    const payments = [
      makePayment({ id: "1", status: "APPROVED" }),
      makePayment({ id: "2", status: "PENDING" }),
      makePayment({ id: "3", status: "PENDING" }),
    ];
    const finance = buildFinanceStats([], payments);
    expect(finance.paymentsByStatus.APPROVED).toBe(1);
    expect(finance.paymentsByStatus.PENDING).toBe(2);
    expect(finance.paymentsByStatus.DECLINED).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Ingresos del período
// ---------------------------------------------------------------------------

describe("buildRevenuePeriodStats", () => {
  it("usa updatedAt (fecha de aprobación), NO createdAt (fecha de intento)", () => {
    const payments = [
      makePayment({
        status: "APPROVED",
        amount: 700,
        createdAt: iso(40), // intento fuera del período de 7d
        updatedAt: iso(1), // aprobado dentro del período de 7d
      }),
    ];
    const stats = buildRevenuePeriodStats(payments, "7d", NOW);
    expect(stats.receivedByCurrency.COP).toBe(700);
  });

  it("excluye pagos aprobados fuera del período", () => {
    const payments = [makePayment({ status: "APPROVED", amount: 700, updatedAt: iso(40) })];
    const stats = buildRevenuePeriodStats(payments, "7d", NOW);
    expect(stats.receivedByCurrency.COP).toBeUndefined();
    expect(stats.approvedPaymentsCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

describe("buildLeadsStats", () => {
  it("distribución por lead_status usa TODAS las conversaciones (estado actual, no filtrado por período)", () => {
    const conversations = [
      makeConversation({ id: "1", leadStatus: "hot", createdAt: iso(400) }),
      makeConversation({ id: "2", leadStatus: "interested", createdAt: iso(1) }),
    ];
    const stats = buildLeadsStats(conversations, "7d", NOW);
    expect(stats.byStatus.hot).toBe(1);
    expect(stats.byStatus.interested).toBe(1);
    expect(stats.totalAllTime).toBe(2);
  });

  it("newInPeriod y averageScoreInPeriod sí respetan el período (createdAt)", () => {
    const conversations = [
      makeConversation({ id: "1", createdAt: iso(1), leadScore: 80 }),
      makeConversation({ id: "2", createdAt: iso(1), leadScore: 40 }),
      makeConversation({ id: "3", createdAt: iso(40), leadScore: 100 }),
    ];
    const stats = buildLeadsStats(conversations, "7d", NOW);
    expect(stats.newInPeriod).toBe(2);
    expect(stats.averageScoreInPeriod).toBe(60);
  });

  it("averageScoreInPeriod es null (no 0) cuando no hay conversaciones nuevas en el período", () => {
    const conversations = [makeConversation({ createdAt: iso(400) })];
    const stats = buildLeadsStats(conversations, "7d", NOW);
    expect(stats.averageScoreInPeriod).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Conversión
// ---------------------------------------------------------------------------

describe("buildConversionStats", () => {
  it("cuenta clientes convertidos como CLIENTES ÚNICOS, no conversaciones", () => {
    const conversations = [
      makeConversation({ id: "1", clientId: "client-A" }),
      makeConversation({ id: "2", clientId: "client-A" }), // mismo cliente, dos conversaciones
      makeConversation({ id: "3", clientId: null }),
    ];
    const stats = buildConversionStats(conversations);
    expect(stats.conversationsTotal).toBe(3);
    expect(stats.convertedClientsCount).toBe(1);
    expect(stats.conversionRatePct).toBe(33);
  });

  it("sin conversaciones → tasa null, no dividir por cero", () => {
    const stats = buildConversionStats([]);
    expect(stats.conversationsTotal).toBe(0);
    expect(stats.conversionRatePct).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Series temporales
// ---------------------------------------------------------------------------

describe("buildRevenueSeries", () => {
  it("período sin ningún pago aprobado → currency null y points vacío (nunca una línea plana en 0)", () => {
    const series = buildRevenueSeries([], "30d", NOW);
    expect(series.currency).toBeNull();
    expect(series.points).toEqual([]);
  });

  it("agrupa correctamente por bucket y elige la moneda dominante", () => {
    const payments = [
      makePayment({ id: "1", status: "APPROVED", amount: 1000, currency: "COP", updatedAt: iso(1) }),
      makePayment({ id: "2", status: "APPROVED", amount: 2000, currency: "COP", updatedAt: iso(1) }),
      makePayment({ id: "3", status: "APPROVED", amount: 50, currency: "USD", updatedAt: iso(1) }),
    ];
    const series = buildRevenueSeries(payments, "7d", NOW);
    expect(series.currency).toBe("COP");
    expect(series.otherCurrenciesExcluded).toEqual(["USD"]);
    const total = series.points.reduce((sum, p) => sum + p.value, 0);
    expect(total).toBe(3000);
  });

  it("pagos no aprobados nunca entran en la serie", () => {
    const payments = [makePayment({ status: "PENDING", amount: 99999, updatedAt: iso(1) })];
    const series = buildRevenueSeries(payments, "7d", NOW);
    expect(series.currency).toBeNull();
  });
});

describe("buildNewClientsSeries", () => {
  it("cuenta clientes nuevos por bucket, sin inventar actividad en buckets vacíos", () => {
    const clients = [makeClient({ createdAt: iso(1) })];
    const series = buildNewClientsSeries(clients, "7d", NOW);
    const total = series.points.reduce((sum, p) => sum + p.value, 0);
    expect(total).toBe(1);
    // El resto de buckets del período existen (para dibujar el eje) pero en 0 real, no inventado.
    expect(series.points.length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Snapshot integrador
// ---------------------------------------------------------------------------

describe("buildStatisticsSnapshot", () => {
  it("arma un snapshot consistente a partir de datos vacíos, sin lanzar", () => {
    const snapshot = buildStatisticsSnapshot({
      clients: [],
      conversations: [],
      projects: [],
      payments: [],
      period: "30d",
      now: NOW,
    });
    expect(snapshot.clients.totalAllTime).toBe(0);
    expect(snapshot.revenueSeries.currency).toBeNull();
    expect(snapshot.conversion.conversionRatePct).toBeNull();
  });

  it("respeta el período pasado como argumento en todas las sub-secciones period-aware", () => {
    const clients = [makeClient({ createdAt: iso(1) }), makeClient({ id: "b", createdAt: iso(200) })];
    const snapshot = buildStatisticsSnapshot({
      clients,
      conversations: [],
      projects: [],
      payments: [],
      period: "7d",
      now: NOW,
    });
    expect(snapshot.period).toBe("7d");
    expect(snapshot.clients.newInPeriod).toBe(1);
    expect(snapshot.clients.totalAllTime).toBe(2);
  });
});
