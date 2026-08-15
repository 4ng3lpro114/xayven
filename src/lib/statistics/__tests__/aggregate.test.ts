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
  buildConversionPeriodStats,
  buildFunnelSnapshot,
  buildFunnelEvolution,
  buildLeadsSeries,
  buildProjectsSeries,
  buildConversionsSeries,
  buildClientsExtendedStats,
  buildProjectRawStatusBreakdown,
  buildRevenueByProject,
  buildRevenueByClient,
  buildRevenueByPaymentType,
  buildAIConversationStats,
  buildMaintenanceStats,
  isLeadGeneratingConversation,
  buildPromotionAttributionStats,
} from "@/lib/statistics/aggregate";
import { buildClientSummaries } from "@/lib/clients/summary";
import type { Conversation, LeadStatusHistoryEntry, MaintenanceRequest } from "@/lib/db/types";
import type { Client, Payment, Project } from "@/lib/payments/types";
import type { Promotion } from "@/lib/promotions/types";

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
    company: null,
    isCommercial: true,
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
    convertedAt: null,
    promotionId: null,
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
    const stats = buildProjectsStats(projects, "all", NOW);
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
    const stats = buildProjectsStats(projects, "all", NOW);
    expect(stats.pendingByCurrency.COP).toBe(1000); // no 3000
  });

  it("valor contratado suma TODOS los proyectos, incluidos los cancelados", () => {
    const projects = [
      makeProject({ id: "p1", totalAmount: 1000 }),
      makeProject({ id: "p2", status: "cancelled", totalAmount: 2000 }),
    ];
    expect(buildProjectsStats(projects, "all", NOW).contractedByCurrency.COP).toBe(3000);
  });

  it("newInPeriod (Fase 10) — cuenta solo los proyectos creados dentro del período", () => {
    const projects = [
      makeProject({ id: "p1", createdAt: iso(2) }), // dentro de 7d
      makeProject({ id: "p2", createdAt: iso(40) }), // fuera de 7d
    ];
    const stats = buildProjectsStats(projects, "7d", NOW);
    expect(stats.newInPeriod).toBe(1);
    expect(stats.totalAllTime).toBe(2);
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

// ---------------------------------------------------------------------------
// Fase 10 — Analytics V2
// ---------------------------------------------------------------------------

let historyIdCounter = 0;
function makeHistoryEntry(overrides: Partial<LeadStatusHistoryEntry> = {}): LeadStatusHistoryEntry {
  historyIdCounter += 1;
  return {
    id: `history-${historyIdCounter}`,
    conversationId: "conv-1",
    clientId: null,
    fromStatus: "exploring",
    toStatus: "interested",
    changedAt: iso(0),
    changedBy: "ai",
    source: "ai_chat_turn",
    metadata: {},
    ...overrides,
  };
}

function makeMaintenanceRequest(overrides: Partial<MaintenanceRequest> = {}): MaintenanceRequest {
  return {
    id: "maint-1",
    createdAt: iso(0),
    name: "Cliente",
    email: "cliente@example.com",
    company: null,
    website: "https://example.com",
    need: "Actualizar plugins",
    priority: "normal",
    message: "...",
    status: "new",
    ...overrides,
  };
}

describe("buildConversionPeriodStats", () => {
  it("cuenta solo conversiones con converted_at dentro del período", () => {
    const conversations = [
      makeConversation({ id: "a", clientId: "c1", convertedAt: iso(2) }), // dentro de 7d
      makeConversation({ id: "b", clientId: "c2", convertedAt: iso(40) }), // fuera de 7d
    ];
    const stats = buildConversionPeriodStats(conversations, "7d", NOW);
    expect(stats.convertedInPeriod).toBe(1);
  });

  it("convertedAt null (pre-Fase 9B) NUNCA se cuenta en el período — se reporta aparte, nunca como 'ahora'", () => {
    const conversations = [
      makeConversation({ id: "a", clientId: "c1", convertedAt: null }),
      makeConversation({ id: "b", clientId: "c2", convertedAt: iso(2) }),
    ];
    const stats = buildConversionPeriodStats(conversations, "7d", NOW);
    expect(stats.convertedInPeriod).toBe(1); // solo "b" — "a" nunca se infiere como reciente
    expect(stats.unknownDateConversionsAllTime).toBe(1);
  });

  it("clientId null (nunca convertido) no cuenta ni en período ni en fecha desconocida", () => {
    const conversations = [makeConversation({ id: "a", clientId: null, convertedAt: null })];
    const stats = buildConversionPeriodStats(conversations, "7d", NOW);
    expect(stats.convertedInPeriod).toBe(0);
    expect(stats.unknownDateConversionsAllTime).toBe(0);
  });
});

describe("buildFunnelSnapshot — porcentajes", () => {
  it("calcula pctOfTotal y pctOfPrevious correctamente sobre una distribución real", () => {
    const conversations = [
      makeConversation({ id: "1", leadStatus: "exploring" }),
      makeConversation({ id: "2", leadStatus: "exploring" }),
      makeConversation({ id: "3", leadStatus: "interested" }),
      makeConversation({ id: "4", leadStatus: "hot" }),
      makeConversation({ id: "5", leadStatus: "client" }),
    ];
    const snapshot = buildFunnelSnapshot(conversations);

    const [conv, exploring, interested, hot, client] = snapshot.stages;
    expect(conv!.count).toBe(5);
    expect(exploring!.count).toBe(5); // todas están en exploring o más allá
    expect(interested!.count).toBe(3); // interested + hot + client
    expect(hot!.count).toBe(2); // hot + client
    expect(client!.count).toBe(1);

    expect(client!.pctOfTotal).toBe(20); // 1/5
    expect(hot!.pctOfPrevious).toBe(67); // 2/3 redondeado
  });

  it("Fase 10 (opción 3): exactCount es el conteo crudo por estado — distinto de count (acumulado) en las etapas intermedias", () => {
    const conversations = [
      makeConversation({ id: "1", leadStatus: "exploring" }),
      makeConversation({ id: "2", leadStatus: "exploring" }),
      makeConversation({ id: "3", leadStatus: "interested" }),
      makeConversation({ id: "4", leadStatus: "hot" }),
      makeConversation({ id: "5", leadStatus: "client" }),
    ];
    const snapshot = buildFunnelSnapshot(conversations);
    const [conv, exploring, interested, hot, client] = snapshot.stages;

    // "conversations" y "client" coinciden SIEMPRE con count por construcción.
    expect(conv!.exactCount).toBe(conv!.count); // 5 === 5
    expect(client!.exactCount).toBe(client!.count); // 1 === 1

    // Las 3 etapas intermedias SÍ difieren: exactCount es crudo, count es acumulado.
    expect(exploring!.exactCount).toBe(2); // solo las 2 que están literalmente en "exploring"
    expect(exploring!.count).toBe(5); // acumulado (exploring o más allá)
    expect(interested!.exactCount).toBe(1);
    expect(interested!.count).toBe(3);
    expect(hot!.exactCount).toBe(1);
    expect(hot!.count).toBe(2);
  });

  it("exactCount usa EXACTAMENTE la misma regla que la pestaña Leads ('Por estado') — nunca una definición distinta", () => {
    const conversations = [
      makeConversation({ id: "1", leadStatus: "exploring" }),
      makeConversation({ id: "2", leadStatus: "interested" }),
      makeConversation({ id: "3", leadStatus: "interested" }),
      makeConversation({ id: "4", leadStatus: "hot" }),
      makeConversation({ id: "5", leadStatus: "client" }),
      makeConversation({ id: "6", leadStatus: "support" }),
    ];

    // La misma regla que usa LeadsTab en page.tsx: byStatus[c.leadStatus] += 1.
    const byStatus: Record<string, number> = { exploring: 0, interested: 0, hot: 0, client: 0, support: 0 };
    for (const c of conversations) byStatus[c.leadStatus] = (byStatus[c.leadStatus] ?? 0) + 1;

    const snapshot = buildFunnelSnapshot(conversations);
    const [, exploring, interested, hot, client] = snapshot.stages;

    expect(exploring!.exactCount).toBe(byStatus.exploring);
    expect(interested!.exactCount).toBe(byStatus.interested);
    expect(hot!.exactCount).toBe(byStatus.hot);
    expect(client!.exactCount).toBe(byStatus.client);
  });

  it("'support' se excluye del alcance interested/hot pero cuenta en el total y se reporta aparte", () => {
    const conversations = [
      makeConversation({ id: "1", leadStatus: "support" }),
      makeConversation({ id: "2", leadStatus: "exploring" }),
    ];
    const snapshot = buildFunnelSnapshot(conversations);
    expect(snapshot.supportCount).toBe(1);
    expect(snapshot.stages[0]!.count).toBe(2); // "conversations" incluye support
    expect(snapshot.stages[1]!.count).toBe(1); // "exploring o más allá" NO incluye support
  });

  it("array vacío → todos los conteos en 0, ningún porcentaje inventado (null, nunca NaN/Infinity)", () => {
    const snapshot = buildFunnelSnapshot([]);
    for (const stage of snapshot.stages) {
      expect(stage.count).toBe(0);
      expect(stage.exactCount).toBe(0);
      expect(stage.pctOfTotal).toBeNull();
      if (stage.key !== "conversations") {
        expect(Number.isNaN(stage.pctOfPrevious)).toBe(false);
      }
    }
  });
});

describe("buildFunnelEvolution", () => {
  it("history vacío → hasData false, sin inventar series", () => {
    const evolution = buildFunnelEvolution([], "30d", NOW);
    expect(evolution.hasData).toBe(false);
    expect(evolution.reachedInterested).toEqual([]);
  });

  it("cuenta transiciones reales por to_status, agrupadas en buckets", () => {
    const history = [
      makeHistoryEntry({ toStatus: "interested", changedAt: iso(1) }),
      makeHistoryEntry({ toStatus: "hot", changedAt: iso(1) }),
      makeHistoryEntry({ toStatus: "client", changedAt: iso(1) }),
    ];
    const evolution = buildFunnelEvolution(history, "7d", NOW);
    expect(evolution.hasData).toBe(true);
    expect(evolution.reachedInterested.reduce((s, p) => s + p.value, 0)).toBe(1);
    expect(evolution.reachedHot.reduce((s, p) => s + p.value, 0)).toBe(1);
    expect(evolution.reachedClient.reduce((s, p) => s + p.value, 0)).toBe(1);
  });
});

describe("series de leads/proyectos/conversiones", () => {
  it("buildLeadsSeries cuenta conversaciones nuevas por bucket", () => {
    const conversations = [makeConversation({ id: "a", createdAt: iso(1) })];
    const series = buildLeadsSeries(conversations, "7d", NOW);
    expect(series.points.reduce((s, p) => s + p.value, 0)).toBe(1);
  });

  it("buildLeadsSeries con array vacío no lanza y no inventa actividad", () => {
    const series = buildLeadsSeries([], "7d", NOW);
    expect(series.points.every((p) => p.value === 0)).toBe(true);
  });

  it("buildProjectsSeries cuenta proyectos nuevos por bucket", () => {
    const projects = [makeProject({ id: "p1", createdAt: iso(2) })];
    const series = buildProjectsSeries(projects, "7d", NOW);
    expect(series.points.reduce((s, p) => s + p.value, 0)).toBe(1);
  });

  it("buildConversionsSeries cuenta solo conversiones con converted_at conocido, y reporta las de fecha desconocida aparte", () => {
    const conversations = [
      makeConversation({ id: "a", clientId: "c1", convertedAt: iso(1) }),
      makeConversation({ id: "b", clientId: "c2", convertedAt: null }),
    ];
    const series = buildConversionsSeries(conversations, "7d", NOW);
    expect(series.points.reduce((s, p) => s + p.value, 0)).toBe(1);
    expect(series.unknownDateConversionsAllTime).toBe(1);
  });
});

describe("buildClientsExtendedStats — clientes recurrentes", () => {
  it("cuenta correctamente clientes con proyectos y clientes recurrentes (>1 proyecto)", () => {
    const clients = [makeClient({ id: "c1" }), makeClient({ id: "c2" }), makeClient({ id: "c3" })];
    const projects = [
      makeProject({ id: "p1", clientId: "c1" }),
      makeProject({ id: "p2", clientId: "c1" }), // c1 tiene 2 → recurrente
      makeProject({ id: "p3", clientId: "c2" }), // c2 tiene 1 → no recurrente
      // c3 sin proyectos
    ];
    const summaries = buildClientSummaries({ clients, conversations: [], projects, payments: [] });
    const extended = buildClientsExtendedStats(summaries);

    expect(extended.withProjectsCount).toBe(2); // c1, c2
    expect(extended.recurringCount).toBe(1); // solo c1
  });

  it("totalPaidByCurrency nunca mezcla monedas distintas", () => {
    const clients = [makeClient({ id: "c1" }), makeClient({ id: "c2" })];
    const projects = [
      makeProject({ id: "p1", clientId: "c1", currency: "COP", totalAmount: 1000, paidAmount: 1000 }),
      makeProject({ id: "p2", clientId: "c2", currency: "USD", totalAmount: 500, paidAmount: 500 }),
    ];
    const summaries = buildClientSummaries({ clients, conversations: [], projects, payments: [] });
    const extended = buildClientsExtendedStats(summaries);

    expect(extended.totalPaidByCurrency.COP).toBe(1000);
    expect(extended.totalPaidByCurrency.USD).toBe(500);
  });
});

describe("buildProjectRawStatusBreakdown", () => {
  it("cuenta cada uno de los 9 ProjectStatus reales por separado", () => {
    const projects = [
      makeProject({ id: "p1", status: "active" }),
      makeProject({ id: "p2", status: "in_progress" }),
      makeProject({ id: "p3", status: "in_progress" }),
    ];
    const breakdown = buildProjectRawStatusBreakdown(projects);
    expect(breakdown.active).toBe(1);
    expect(breakdown.in_progress).toBe(2);
    expect(breakdown.review).toBe(0);
    expect(breakdown.maintenance).toBe(0);
  });
});

describe("ingresos por proyecto/cliente/tipo de pago", () => {
  it("buildRevenueByProject suma solo pagos APPROVED, agrupados por projectId", () => {
    const projects = [makeProject({ id: "p1", name: "Sitio web" })];
    const payments = [
      makePayment({ id: "pay1", projectId: "p1", amount: 500_000, status: "APPROVED" }),
      makePayment({ id: "pay2", projectId: "p1", amount: 300_000, status: "PENDING" }), // no cuenta
    ];
    const stats = buildRevenueByProject(payments, projects);
    expect(stats.entries).toHaveLength(1);
    expect(stats.entries[0]!.label).toBe("Sitio web");
    expect(stats.entries[0]!.amountsByCurrency.COP).toBe(500_000);
  });

  it("buildRevenueByProject nunca mezcla monedas distintas del mismo proyecto", () => {
    const projects = [makeProject({ id: "p1" })];
    const payments = [
      makePayment({ id: "pay1", projectId: "p1", currency: "COP", amount: 1000, status: "APPROVED" }),
      makePayment({ id: "pay2", projectId: "p1", currency: "USD", amount: 50, status: "APPROVED" }),
    ];
    const stats = buildRevenueByProject(payments, projects);
    expect(stats.entries[0]!.amountsByCurrency).toEqual({ COP: 1000, USD: 50 });
  });

  it("buildRevenueByClient usa el nombre del cliente como label, nunca email/teléfono", () => {
    const clients = [makeClient({ id: "c1", name: "Ana Restrepo", email: "ana@example.com", phone: "3000000000" })];
    const payments = [makePayment({ id: "pay1", clientId: "c1", amount: 200_000, status: "APPROVED" })];
    const stats = buildRevenueByClient(payments, clients);
    expect(stats.entries[0]!.label).toBe("Ana Restrepo");
    expect(JSON.stringify(stats.entries[0])).not.toContain("ana@example.com");
    expect(JSON.stringify(stats.entries[0])).not.toContain("3000000000");
  });

  it("buildRevenueByPaymentType desglosa por los 4 valores reales de payment_type", () => {
    const payments = [
      makePayment({ id: "pay1", paymentType: "DEPOSIT", amount: 100, status: "APPROVED" }),
      makePayment({ id: "pay2", paymentType: "MAINTENANCE", amount: 50, status: "APPROVED" }),
      makePayment({ id: "pay3", paymentType: "DEPOSIT", amount: 999, status: "PENDING" }), // no cuenta
    ];
    const stats = buildRevenueByPaymentType(payments);
    expect(stats.byType.DEPOSIT.COP).toBe(100);
    expect(stats.byType.MAINTENANCE.COP).toBe(50);
    expect(stats.byType.BALANCE).toEqual({});
  });

  it("array de pagos vacío → todas las entradas vacías, sin lanzar", () => {
    expect(buildRevenueByProject([], []).entries).toEqual([]);
    expect(buildRevenueByClient([], []).entries).toEqual([]);
    expect(buildRevenueByPaymentType([]).byType.DEPOSIT).toEqual({});
  });
});

describe("isLeadGeneratingConversation / buildAIConversationStats", () => {
  it("exploring sin email → NO genera lead", () => {
    expect(isLeadGeneratingConversation({ leadStatus: "exploring", visitorEmail: null })).toBe(false);
  });

  it("exploring CON email → SÍ genera lead", () => {
    expect(isLeadGeneratingConversation({ leadStatus: "exploring", visitorEmail: "x@example.com" })).toBe(true);
  });

  it("interested sin email → SÍ genera lead (progresó más allá de exploring)", () => {
    expect(isLeadGeneratingConversation({ leadStatus: "interested", visitorEmail: null })).toBe(true);
  });

  it("buildAIConversationStats cuenta mensajes y calcula la tasa de generación de leads en el período", () => {
    const conversations = [
      makeConversation({
        id: "a",
        createdAt: iso(1),
        leadStatus: "interested",
        messages: [
          { role: "user", content: "hola", createdAt: iso(1) },
          { role: "assistant", content: "hola!", createdAt: iso(1) },
        ],
      }),
      makeConversation({ id: "b", createdAt: iso(1), leadStatus: "exploring", visitorEmail: null, messages: [] }),
    ];
    const stats = buildAIConversationStats(conversations, "7d", NOW);
    expect(stats.leadGeneratingConversationsInPeriod).toBe(1);
    expect(stats.leadGenerationRatePct).toBe(50);
    expect(stats.totalMessagesInPeriod).toBe(2);
    expect(stats.averageMessagesPerConversationInPeriod).toBe(1);
  });

  it("período sin conversaciones → todo null/0, nunca NaN", () => {
    const stats = buildAIConversationStats([], "7d", NOW);
    expect(stats.leadGeneratingConversationsInPeriod).toBe(0);
    expect(stats.leadGenerationRatePct).toBeNull();
    expect(stats.averageMessagesPerConversationInPeriod).toBeNull();
  });
});

describe("buildMaintenanceStats", () => {
  it("cuenta solicitudes por estado e ingresos de mantenimiento por separado", () => {
    const requests = [
      makeMaintenanceRequest({ id: "r1", status: "new" }),
      makeMaintenanceRequest({ id: "r2", status: "new" }),
      makeMaintenanceRequest({ id: "r3", status: "contacted" }),
      makeMaintenanceRequest({ id: "r4", status: "resolved" }),
    ];
    const payments = [
      makePayment({ id: "pay1", paymentType: "MAINTENANCE", amount: 80_000, status: "APPROVED" }),
      makePayment({ id: "pay2", paymentType: "DEPOSIT", amount: 500_000, status: "APPROVED" }), // no cuenta aquí
    ];
    const stats = buildMaintenanceStats(requests, payments);
    expect(stats.totalAllTime).toBe(4);
    expect(stats.newCount).toBe(2);
    expect(stats.contactedCount).toBe(1);
    expect(stats.resolvedCount).toBe(1);
    expect(stats.revenueByCurrency.COP).toBe(80_000);
  });

  it("sin solicitudes ni pagos → todo en 0/vacío, sin lanzar", () => {
    const stats = buildMaintenanceStats([], []);
    expect(stats.totalAllTime).toBe(0);
    expect(stats.revenueByCurrency).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Promociones (Fase 11 Etapa A)
// ---------------------------------------------------------------------------

function makePromotion(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: "promo-1",
    createdAt: iso(0),
    updatedAt: iso(0),
    name: "Promoción de prueba",
    text: "20% de descuento",
    discountType: "percentage",
    discountValue: 20,
    currency: null,
    startAt: iso(10),
    endAt: iso(-10),
    audience: "all",
    status: "scheduled",
    ctaLabel: "Quiero aprovecharla",
    ctaMessage: null,
    metadata: {},
    audienceRules: null,
    ...overrides,
  };
}

describe("buildPromotionAttributionStats", () => {
  it("K. sin ninguna conversación atribuida → todo en 0, no rompe nada existente", () => {
    const stats = buildPromotionAttributionStats(
      [makeConversation({ promotionId: null })],
      [makePromotion()]
    );
    expect(stats.totalAttributedConversations).toBe(0);
    expect(stats.entries).toEqual([]);
  });

  it("cuenta correctamente conversaciones atribuidas, agrupadas por promoción y ordenadas por conteo", () => {
    const promoA = makePromotion({ id: "promo-a", name: "Promo A" });
    const promoB = makePromotion({ id: "promo-b", name: "Promo B" });
    const conversations = [
      makeConversation({ id: "c1", promotionId: "promo-a" }),
      makeConversation({ id: "c2", promotionId: "promo-a" }),
      makeConversation({ id: "c3", promotionId: "promo-b" }),
      makeConversation({ id: "c4", promotionId: null }), // no cuenta
    ];

    const stats = buildPromotionAttributionStats(conversations, [promoA, promoB]);

    expect(stats.totalAttributedConversations).toBe(3);
    expect(stats.entries).toEqual([
      { promotionId: "promo-a", label: "Promo A", conversationsCount: 2 },
      { promotionId: "promo-b", label: "Promo B", conversationsCount: 1 },
    ]);
  });

  it("promotion_id que no corresponde a ninguna promoción conocida → fallback explícito, nunca inventa un nombre", () => {
    const conversations = [makeConversation({ id: "c1", promotionId: "promo-desconocida" })];

    const stats = buildPromotionAttributionStats(conversations, []);

    expect(stats.entries).toEqual([
      { promotionId: "promo-desconocida", label: "Promoción no encontrada", conversationsCount: 1 },
    ]);
  });
});
