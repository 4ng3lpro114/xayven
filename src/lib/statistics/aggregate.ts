import type { Conversation, LeadStatus, LeadStatusHistoryEntry, MaintenanceRequest } from "@/lib/db/types";
import type { Client, Payment, PaymentStatus, PaymentType, Project } from "@/lib/payments/types";
import { pendingAmount } from "@/lib/payments/types";
import type { ClientSummary } from "@/lib/clients/summary";
import { classifyProjectWorkStage } from "@/lib/statistics/projectStages";
import { bucketLabel, bucketStartFor, enumerateBuckets, resolvePeriodRange, resolvePreviousPeriodRange } from "@/lib/statistics/period";
import type {
  AIConversationStats,
  ClientsExtendedStats,
  ClientsStats,
  ConversionPeriodStats,
  ConversionsTimeSeries,
  ConversionStats,
  FinanceStats,
  FunnelEvolutionSeries,
  FunnelSnapshot,
  FunnelStageKey,
  LeadsStats,
  LeadsTimeSeries,
  MaintenanceStats,
  MoneyByCurrency,
  NewClientsTimeSeries,
  ProjectRawStatusBreakdown,
  ProjectsStats,
  ProjectsTimeSeries,
  ProjectWorkStage,
  RevenueByClientStats,
  RevenueByGroupEntry,
  RevenueByPaymentTypeStats,
  RevenueByProjectStats,
  RevenuePeriodStats,
  RevenueTimeSeries,
  StatisticsPeriod,
  StatisticsSnapshot,
  TimeSeriesPoint,
} from "@/lib/statistics/types";
import { STATISTICS_PERIODS } from "@/lib/statistics/types";

/**
 * Fase 7B — agregación de estadísticas. Puro, sin I/O (mismo patrón que
 * src/lib/clients/summary.ts / activity.ts): recibe datos ya obtenidos
 * (bulk-fetch hecho una sola vez en la página) y reduce todo en memoria.
 * No introduce un sistema paralelo de acceso a datos ni queries nuevas.
 *
 * Regla general de fechas (ver auditoría Fase 7A §8):
 *   - "nuevo/creado en el período" → siempre createdAt del propio registro.
 *   - "ingresos del período"       → payments.updatedAt WHERE APPROVED
 *     (proxy confiable de fecha de aprobación real — nunca createdAt del
 *     pago, que es solo cuándo se INICIÓ el intento, ni fechas del proyecto).
 *
 * Regla general de histórico (ver auditoría §9): todo lo marcado como
 * "actual"/"all-time" en los types es una FOTO de ahora mismo, no una
 * reconstrucción de un momento pasado — no existe snapshot/log de estados
 * en el esquema real. La única serie temporal genuinamente confiable es la
 * de ingresos (los pagos nunca se borran — no existe deletePayment()).
 */

function addMoney(map: MoneyByCurrency, currency: string, amount: number): void {
  map[currency] = (map[currency] ?? 0) + amount;
}

function inRange(iso: string, start: Date | null, end: Date): boolean {
  const t = new Date(iso).getTime();
  if (start && t < start.getTime()) return false;
  return t <= end.getTime();
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export function buildClientsStats(
  clients: Client[],
  period: StatisticsPeriod,
  now: Date
): ClientsStats {
  const { start, end } = resolvePeriodRange(period, now);
  const newInPeriod = clients.filter((c) => inRange(c.createdAt, start, end)).length;

  const prev = resolvePreviousPeriodRange(period, now);
  const newInPreviousPeriod = prev
    ? clients.filter((c) => inRange(c.createdAt, prev.start, prev.end)).length
    : null;

  const growthPct =
    newInPreviousPeriod && newInPreviousPeriod > 0
      ? Math.round(((newInPeriod - newInPreviousPeriod) / newInPreviousPeriod) * 100)
      : null;

  return {
    totalAllTime: clients.length,
    newInPeriod,
    newInPreviousPeriod,
    growthPct,
  };
}

// ---------------------------------------------------------------------------
// Proyectos / Trabajos
// ---------------------------------------------------------------------------

const EMPTY_STAGE_COUNTS: Record<ProjectWorkStage, number> = {
  completed: 0,
  in_progress: 0,
  pending: 0,
  cancelled: 0,
};

export function buildProjectsStats(
  projects: Project[],
  period: StatisticsPeriod,
  now: Date
): ProjectsStats {
  const byStage: Record<ProjectWorkStage, number> = { ...EMPTY_STAGE_COUNTS };
  const contractedByCurrency: MoneyByCurrency = {};
  const pendingByCurrency: MoneyByCurrency = {};

  for (const project of projects) {
    const stage = classifyProjectWorkStage(project.status);
    byStage[stage] += 1;
    addMoney(contractedByCurrency, project.currency, project.totalAmount);
    // Un proyecto cancelado no es dinero cobrable — no cuenta como pendiente.
    if (stage !== "cancelled") {
      addMoney(pendingByCurrency, project.currency, pendingAmount(project));
    }
  }

  const { start, end } = resolvePeriodRange(period, now);
  const newInPeriod = projects.filter((p) => inRange(p.createdAt, start, end)).length;

  return { totalAllTime: projects.length, newInPeriod, byStage, contractedByCurrency, pendingByCurrency };
}

// ---------------------------------------------------------------------------
// Finanzas (all-time)
// ---------------------------------------------------------------------------

const EMPTY_PAYMENT_STATUS_COUNTS: Record<PaymentStatus, number> = {
  PENDING: 0,
  APPROVED: 0,
  DECLINED: 0,
  ERROR: 0,
  VOIDED: 0,
  REFUNDED: 0,
};

export function buildFinanceStats(projects: Project[], payments: Payment[]): FinanceStats {
  const contractedByCurrency: MoneyByCurrency = {};
  for (const project of projects) addMoney(contractedByCurrency, project.currency, project.totalAmount);

  const pendingByCurrency: MoneyByCurrency = {};
  for (const project of projects) {
    if (classifyProjectWorkStage(project.status) !== "cancelled") {
      addMoney(pendingByCurrency, project.currency, pendingAmount(project));
    }
  }

  const paymentsByStatus: Record<PaymentStatus, number> = { ...EMPTY_PAYMENT_STATUS_COUNTS };
  const receivedByCurrency: MoneyByCurrency = {};
  const approvedSumByCurrency: MoneyByCurrency = {};
  const approvedCountByCurrency: Record<string, number> = {};
  let approvedPaymentsCount = 0;

  for (const payment of payments) {
    paymentsByStatus[payment.status] += 1;
    if (payment.status === "APPROVED") {
      // Fuente única de ingresos reales — TODOS los payment_type incluidos
      // (incluye MAINTENANCE, que nunca se refleja en projects.paid_amount;
      // ver Fase 7A audit §5). Nunca se usa projects.paid_amount aquí.
      addMoney(receivedByCurrency, payment.currency, payment.amount);
      addMoney(approvedSumByCurrency, payment.currency, payment.amount);
      approvedCountByCurrency[payment.currency] = (approvedCountByCurrency[payment.currency] ?? 0) + 1;
      approvedPaymentsCount += 1;
    }
  }

  const averageApprovedTicketByCurrency: MoneyByCurrency = {};
  for (const [currency, sum] of Object.entries(approvedSumByCurrency)) {
    averageApprovedTicketByCurrency[currency] = Math.round(sum / approvedCountByCurrency[currency]!);
  }

  return {
    contractedByCurrency,
    receivedByCurrency,
    pendingByCurrency,
    averageApprovedTicketByCurrency,
    paymentsByStatus,
    approvedPaymentsCount,
  };
}

// ---------------------------------------------------------------------------
// Ingresos del período (para la card + para elegir la moneda dominante)
// ---------------------------------------------------------------------------

function sumApprovedByCurrency(payments: Payment[], start: Date | null, end: Date): MoneyByCurrency {
  const out: MoneyByCurrency = {};
  for (const p of payments) {
    if (p.status === "APPROVED" && inRange(p.updatedAt, start, end)) {
      addMoney(out, p.currency, p.amount);
    }
  }
  return out;
}

function countApprovedInRange(payments: Payment[], start: Date | null, end: Date): number {
  return payments.filter((p) => p.status === "APPROVED" && inRange(p.updatedAt, start, end)).length;
}

/** The currency with the highest APPROVED total in the period — the one
 *  charted. Deterministic tie-break (alphabetical) so results don't
 *  depend on array order. */
function dominantCurrency(byCurrency: MoneyByCurrency): string | null {
  const entries = Object.entries(byCurrency).filter(([, amount]) => amount > 0);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries[0]![0];
}

export function buildRevenuePeriodStats(
  payments: Payment[],
  period: StatisticsPeriod,
  now: Date
): RevenuePeriodStats {
  const { start, end } = resolvePeriodRange(period, now);
  const receivedByCurrency = sumApprovedByCurrency(payments, start, end);
  const approvedPaymentsCount = countApprovedInRange(payments, start, end);

  const prev = resolvePreviousPeriodRange(period, now);
  let growthPct: number | null = null;
  if (prev) {
    const currency = dominantCurrency(receivedByCurrency);
    if (currency) {
      const previousAmount = sumApprovedByCurrency(payments, prev.start, prev.end)[currency] ?? 0;
      growthPct = previousAmount > 0 ? Math.round(((receivedByCurrency[currency]! - previousAmount) / previousAmount) * 100) : null;
    }
  }

  return { receivedByCurrency, approvedPaymentsCount, growthPct };
}

// ---------------------------------------------------------------------------
// Leads / Conversaciones
// ---------------------------------------------------------------------------

const EMPTY_LEAD_STATUS_COUNTS: Record<LeadStatus, number> = {
  exploring: 0,
  interested: 0,
  hot: 0,
  client: 0,
  support: 0,
};

export function buildLeadsStats(
  conversations: Conversation[],
  period: StatisticsPeriod,
  now: Date
): LeadsStats {
  const { start, end } = resolvePeriodRange(period, now);
  const inPeriod = conversations.filter((c) => inRange(c.createdAt, start, end));

  const byStatus: Record<LeadStatus, number> = { ...EMPTY_LEAD_STATUS_COUNTS };
  for (const c of conversations) byStatus[c.leadStatus] += 1;

  const averageScoreInPeriod =
    inPeriod.length > 0
      ? Math.round(inPeriod.reduce((sum, c) => sum + c.leadScore, 0) / inPeriod.length)
      : null;

  return {
    totalAllTime: conversations.length,
    newInPeriod: inPeriod.length,
    byStatus,
    averageScoreInPeriod,
  };
}

// ---------------------------------------------------------------------------
// Conversión (siempre all-time — ver types.ts / audit §11)
// ---------------------------------------------------------------------------

export function buildConversionStats(conversations: Conversation[]): ConversionStats {
  const convertedClientIds = new Set(
    conversations.filter((c) => c.clientId !== null).map((c) => c.clientId!)
  );
  const conversationsTotal = conversations.length;
  const convertedClientsCount = convertedClientIds.size;
  const conversionRatePct =
    conversationsTotal > 0 ? Math.round((convertedClientsCount / conversationsTotal) * 100) : null;

  return { conversationsTotal, convertedClientsCount, conversionRatePct };
}

/**
 * Fase 10 — the period-scoped counterpart to buildConversionStats(). Uses
 * `converted_at` (0004_conversations_converted_at.sql), which every
 * conversion made since Fase 9B sets — but conversions from before that
 * migration have `converted_at: null` and are NEVER placed in any period,
 * NEVER treated as "now". `unknownDateConversionsAllTime` surfaces that
 * count explicitly instead of silently shrinking the historical total.
 */
export function buildConversionPeriodStats(
  conversations: Conversation[],
  period: StatisticsPeriod,
  now: Date
): ConversionPeriodStats {
  const { start, end } = resolvePeriodRange(period, now);

  let convertedInPeriod = 0;
  let unknownDateConversionsAllTime = 0;

  for (const c of conversations) {
    if (c.clientId === null) continue; // never converted at all
    if (c.convertedAt === null) {
      unknownDateConversionsAllTime += 1;
      continue;
    }
    if (inRange(c.convertedAt, start, end)) convertedInPeriod += 1;
  }

  return { convertedInPeriod, unknownDateConversionsAllTime };
}

// ---------------------------------------------------------------------------
// Series temporales
// ---------------------------------------------------------------------------

export function buildRevenueSeries(
  payments: Payment[],
  period: StatisticsPeriod,
  now: Date
): RevenueTimeSeries {
  const { start: periodStart, end, bucket } = resolvePeriodRange(period, now);

  const approvedInWindow = payments.filter(
    (p) => p.status === "APPROVED" && inRange(p.updatedAt, periodStart, end)
  );

  if (approvedInWindow.length === 0) {
    return { bucket, currency: null, points: [], otherCurrenciesExcluded: [] };
  }

  const totalsByCurrency: MoneyByCurrency = {};
  for (const p of approvedInWindow) addMoney(totalsByCurrency, p.currency, p.amount);
  const currency = dominantCurrency(totalsByCurrency)!;
  const otherCurrenciesExcluded = Object.keys(totalsByCurrency)
    .filter((c) => c !== currency)
    .sort();

  const seriesStart =
    periodStart ??
    approvedInWindow.reduce<Date>(
      (min, p) => (new Date(p.updatedAt) < min ? new Date(p.updatedAt) : min),
      new Date(approvedInWindow[0]!.updatedAt)
    );

  const buckets = enumerateBuckets(seriesStart, end, bucket);
  const totals = new Map(buckets.map((b) => [b.getTime(), 0]));

  for (const p of approvedInWindow) {
    if (p.currency !== currency) continue;
    const key = bucketStartFor(new Date(p.updatedAt), seriesStart, bucket).getTime();
    totals.set(key, (totals.get(key) ?? 0) + p.amount);
  }

  const points = buckets.map((b) => ({
    date: b.toISOString(),
    label: bucketLabel(b, bucket),
    value: totals.get(b.getTime()) ?? 0,
  }));

  return { bucket, currency, points, otherCurrenciesExcluded };
}

export function buildNewClientsSeries(
  clients: Client[],
  period: StatisticsPeriod,
  now: Date
): NewClientsTimeSeries {
  const { start: periodStart, end, bucket } = resolvePeriodRange(period, now);

  const inWindow = clients.filter((c) => inRange(c.createdAt, periodStart, end));

  const seriesStart =
    periodStart ??
    (inWindow.length > 0
      ? inWindow.reduce<Date>(
          (min, c) => (new Date(c.createdAt) < min ? new Date(c.createdAt) : min),
          new Date(inWindow[0]!.createdAt)
        )
      : end);

  const buckets = enumerateBuckets(seriesStart, end, bucket);
  const totals = new Map(buckets.map((b) => [b.getTime(), 0]));

  for (const c of inWindow) {
    const key = bucketStartFor(new Date(c.createdAt), seriesStart, bucket).getTime();
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }

  const points = buckets.map((b) => ({
    date: b.toISOString(),
    label: bucketLabel(b, bucket),
    value: totals.get(b.getTime()) ?? 0,
  }));

  return { bucket, points };
}

// ---------------------------------------------------------------------------
// Snapshot completo
// ---------------------------------------------------------------------------

export function buildStatisticsSnapshot(input: {
  clients: Client[];
  conversations: Conversation[];
  projects: Project[];
  payments: Payment[];
  period: StatisticsPeriod;
  now?: Date;
}): StatisticsSnapshot {
  const now = input.now ?? new Date();
  const { start, end } = resolvePeriodRange(input.period, now);
  const periodLabel = STATISTICS_PERIODS.find((p) => p.key === input.period)?.label ?? input.period;

  return {
    period: input.period,
    periodLabel,
    rangeStart: start ? start.toISOString() : null,
    rangeEnd: end.toISOString(),
    clients: buildClientsStats(input.clients, input.period, now),
    projects: buildProjectsStats(input.projects, input.period, now),
    finance: buildFinanceStats(input.projects, input.payments),
    revenuePeriod: buildRevenuePeriodStats(input.payments, input.period, now),
    leads: buildLeadsStats(input.conversations, input.period, now),
    conversion: buildConversionStats(input.conversations),
    conversionPeriod: buildConversionPeriodStats(input.conversations, input.period, now),
    revenueSeries: buildRevenueSeries(input.payments, input.period, now),
    newClientsSeries: buildNewClientsSeries(input.clients, input.period, now),
  };
}

// ---------------------------------------------------------------------------
// Fase 10 (Analytics V2) — funciones adicionales por pestaña. Cada una es
// pura, sin I/O, y se llama solo cuando su pestaña está activa (ver
// page.tsx) — nunca todas a la vez, ninguna agregada a
// buildStatisticsSnapshot().
// ---------------------------------------------------------------------------

// ---- Funnel -----------------------------------------------------------

const FUNNEL_STAGE_LABELS_ES: Record<FunnelStageKey, string> = {
  conversations: "Conversaciones",
  exploring: "Explorando",
  interested: "Interesado",
  hot: "Caliente",
  client: "Cliente",
};

/**
 * `lead_status` es el estado ACTUAL de cada conversación, no un log de
 * progreso — no es acumulativo por sí mismo (una conversación "hot" no
 * cuenta también como "interested"). Para dibujar un embudo con la forma
 * pedida (monotónicamente decreciente) se reinterpreta cada etapa como
 * "alcance": cuántas conversaciones están HOY en esa etapa o más allá.
 * "support" se excluye deliberadamente del alcance de interested/hot (no
 * hay evidencia de que haya pasado por ahí — nunca se asume), pero sí
 * cuenta en el total de "conversaciones".
 */
export function buildFunnelSnapshot(conversations: Conversation[]): FunnelSnapshot {
  const total = conversations.length;
  let exploringOrBeyond = 0;
  let interestedOrBeyond = 0;
  let hotOrBeyond = 0;
  let clientCount = 0;
  let supportCount = 0;

  // Fase 10 (opción 3 aprobada) — conteo crudo por estado exacto, calculado
  // en la MISMA pasada, con la MISMA regla que ya usa la pestaña Leads
  // ("Por estado": `byStatus[c.leadStatus] += 1`) — nunca una definición
  // distinta ni un segundo cómputo divergente.
  const byStatus: Record<LeadStatus, number> = { ...EMPTY_LEAD_STATUS_COUNTS };

  for (const c of conversations) {
    byStatus[c.leadStatus] += 1;

    if (c.leadStatus === "support") {
      supportCount += 1;
      continue;
    }
    exploringOrBeyond += 1;
    if (c.leadStatus === "interested" || c.leadStatus === "hot" || c.leadStatus === "client") {
      interestedOrBeyond += 1;
    }
    if (c.leadStatus === "hot" || c.leadStatus === "client") hotOrBeyond += 1;
    if (c.leadStatus === "client") clientCount += 1;
  }

  // exactCount: cuántas conversaciones están HOY exactamente en esa etapa
  // (no acumulado). Para "conversations" y "client" siempre coincide con
  // `count` por construcción (no hay nada "más allá" de client, y toda
  // conversación es por definición al menos "conversations") — se muestra
  // igual en las 5 etapas, tal como se pidió explícitamente, aunque ahí no
  // aporte información nueva.
  const stageCounts: { key: FunnelStageKey; count: number; exactCount: number }[] = [
    { key: "conversations", count: total, exactCount: total },
    { key: "exploring", count: exploringOrBeyond, exactCount: byStatus.exploring },
    { key: "interested", count: interestedOrBeyond, exactCount: byStatus.interested },
    { key: "hot", count: hotOrBeyond, exactCount: byStatus.hot },
    { key: "client", count: clientCount, exactCount: byStatus.client },
  ];

  const stages = stageCounts.map((stage, i) => {
    const previousCount = i > 0 ? stageCounts[i - 1]!.count : null;
    return {
      key: stage.key,
      label: FUNNEL_STAGE_LABELS_ES[stage.key],
      count: stage.count,
      exactCount: stage.exactCount,
      pctOfPrevious:
        previousCount !== null && previousCount > 0
          ? Math.round((stage.count / previousCount) * 100)
          : null,
      pctOfTotal: total > 0 ? Math.round((stage.count / total) * 100) : null,
    };
  });

  return { stages, supportCount };
}

export function buildFunnelEvolution(
  history: LeadStatusHistoryEntry[],
  period: StatisticsPeriod,
  now: Date
): FunnelEvolutionSeries {
  const { start, end, bucket } = resolvePeriodRange(period, now);
  const inWindow = history.filter((h) => inRange(h.changedAt, start, end));

  if (inWindow.length === 0) {
    return { bucket, reachedInterested: [], reachedHot: [], reachedClient: [], hasData: false };
  }

  const seriesStart =
    start ??
    inWindow.reduce<Date>(
      (min, h) => (new Date(h.changedAt) < min ? new Date(h.changedAt) : min),
      new Date(inWindow[0]!.changedAt)
    );
  const buckets = enumerateBuckets(seriesStart, end, bucket);

  function seriesFor(toStatus: LeadStatus): TimeSeriesPoint[] {
    const totals = new Map(buckets.map((b) => [b.getTime(), 0]));
    for (const h of inWindow) {
      if (h.toStatus !== toStatus) continue;
      const key = bucketStartFor(new Date(h.changedAt), seriesStart, bucket).getTime();
      totals.set(key, (totals.get(key) ?? 0) + 1);
    }
    return buckets.map((b) => ({
      date: b.toISOString(),
      label: bucketLabel(b, bucket),
      value: totals.get(b.getTime()) ?? 0,
    }));
  }

  return {
    bucket,
    reachedInterested: seriesFor("interested"),
    reachedHot: seriesFor("hot"),
    reachedClient: seriesFor("client"),
    hasData: true,
  };
}

// ---- Series adicionales -------------------------------------------------

export function buildLeadsSeries(
  conversations: Conversation[],
  period: StatisticsPeriod,
  now: Date
): LeadsTimeSeries {
  const { start: periodStart, end, bucket } = resolvePeriodRange(period, now);
  const inWindow = conversations.filter((c) => inRange(c.createdAt, periodStart, end));

  const seriesStart =
    periodStart ??
    (inWindow.length > 0
      ? inWindow.reduce<Date>(
          (min, c) => (new Date(c.createdAt) < min ? new Date(c.createdAt) : min),
          new Date(inWindow[0]!.createdAt)
        )
      : end);

  const buckets = enumerateBuckets(seriesStart, end, bucket);
  const totals = new Map(buckets.map((b) => [b.getTime(), 0]));

  for (const c of inWindow) {
    const key = bucketStartFor(new Date(c.createdAt), seriesStart, bucket).getTime();
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }

  const points = buckets.map((b) => ({
    date: b.toISOString(),
    label: bucketLabel(b, bucket),
    value: totals.get(b.getTime()) ?? 0,
  }));

  return { bucket, points };
}

export function buildProjectsSeries(
  projects: Project[],
  period: StatisticsPeriod,
  now: Date
): ProjectsTimeSeries {
  const { start: periodStart, end, bucket } = resolvePeriodRange(period, now);
  const inWindow = projects.filter((p) => inRange(p.createdAt, periodStart, end));

  const seriesStart =
    periodStart ??
    (inWindow.length > 0
      ? inWindow.reduce<Date>(
          (min, p) => (new Date(p.createdAt) < min ? new Date(p.createdAt) : min),
          new Date(inWindow[0]!.createdAt)
        )
      : end);

  const buckets = enumerateBuckets(seriesStart, end, bucket);
  const totals = new Map(buckets.map((b) => [b.getTime(), 0]));

  for (const p of inWindow) {
    const key = bucketStartFor(new Date(p.createdAt), seriesStart, bucket).getTime();
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }

  const points = buckets.map((b) => ({
    date: b.toISOString(),
    label: bucketLabel(b, bucket),
    value: totals.get(b.getTime()) ?? 0,
  }));

  return { bucket, points };
}

export function buildConversionsSeries(
  conversations: Conversation[],
  period: StatisticsPeriod,
  now: Date
): ConversionsTimeSeries {
  const { start: periodStart, end, bucket } = resolvePeriodRange(period, now);

  const unknownDateConversionsAllTime = conversations.filter(
    (c) => c.clientId !== null && c.convertedAt === null
  ).length;

  const knownDated = conversations.filter((c) => c.clientId !== null && c.convertedAt !== null);
  const inWindow = knownDated.filter((c) => inRange(c.convertedAt!, periodStart, end));

  const seriesStart =
    periodStart ??
    (inWindow.length > 0
      ? inWindow.reduce<Date>(
          (min, c) => (new Date(c.convertedAt!) < min ? new Date(c.convertedAt!) : min),
          new Date(inWindow[0]!.convertedAt!)
        )
      : end);

  const buckets = enumerateBuckets(seriesStart, end, bucket);
  const totals = new Map(buckets.map((b) => [b.getTime(), 0]));

  for (const c of inWindow) {
    const key = bucketStartFor(new Date(c.convertedAt!), seriesStart, bucket).getTime();
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }

  const points = buckets.map((b) => ({
    date: b.toISOString(),
    label: bucketLabel(b, bucket),
    value: totals.get(b.getTime()) ?? 0,
  }));

  return { bucket, points, unknownDateConversionsAllTime };
}

// ---- Clientes (extendido) ------------------------------------------------

/**
 * Recibe el Map ya construido por buildClientSummaries() (Fase 5C,
 * src/lib/clients/summary.ts) — no recalcula nada que ya exista, solo
 * reduce ese resultado a las cifras que pide Analytics V2. Nunca incluye
 * nombre/email/teléfono — ver ClientSummary, que ya los omite.
 */
export function buildClientsExtendedStats(
  clientSummaries: Map<string, ClientSummary>
): ClientsExtendedStats {
  let withProjectsCount = 0;
  let recurringCount = 0;
  const totalPaidByCurrency: MoneyByCurrency = {};

  for (const summary of clientSummaries.values()) {
    if (summary.hasProjects) withProjectsCount += 1;
    if (summary.projectsCount > 1) recurringCount += 1;
    for (const [currency, amount] of Object.entries(summary.paidAmount)) {
      addMoney(totalPaidByCurrency, currency, amount);
    }
  }

  return { withProjectsCount, recurringCount, totalPaidByCurrency };
}

// ---- Proyectos (extendido) ----------------------------------------------

const EMPTY_RAW_STATUS_COUNTS: ProjectRawStatusBreakdown = {
  lead: 0,
  proposal: 0,
  awaiting_payment: 0,
  active: 0,
  in_progress: 0,
  review: 0,
  completed: 0,
  maintenance: 0,
  cancelled: 0,
};

export function buildProjectRawStatusBreakdown(projects: Project[]): ProjectRawStatusBreakdown {
  const byStatus: ProjectRawStatusBreakdown = { ...EMPTY_RAW_STATUS_COUNTS };
  for (const p of projects) byStatus[p.status] += 1;
  return byStatus;
}

// ---- Finanzas: desgloses ----------------------------------------------

/** Solo para ORDENAR entradas que pueden mezclar monedas — nunca se suman
 *  monedas distintas en el dato devuelto, solo se usa el máximo de las
 *  presentes en una entrada como llave de orden transitoria. */
function sortKeyAmount(amountsByCurrency: MoneyByCurrency): number {
  const values = Object.values(amountsByCurrency);
  return values.length > 0 ? Math.max(...values) : 0;
}

export function buildRevenueByProject(payments: Payment[], projects: Project[]): RevenueByProjectStats {
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
  const totalsByProject = new Map<string, MoneyByCurrency>();

  for (const payment of payments) {
    if (payment.status !== "APPROVED") continue;
    const existing = totalsByProject.get(payment.projectId) ?? {};
    addMoney(existing, payment.currency, payment.amount);
    totalsByProject.set(payment.projectId, existing);
  }

  const entries: RevenueByGroupEntry[] = [...totalsByProject.entries()]
    .map(([id, amountsByCurrency]) => ({
      id,
      label: projectNameById.get(id) ?? "Proyecto eliminado",
      amountsByCurrency,
    }))
    .sort((a, b) => sortKeyAmount(b.amountsByCurrency) - sortKeyAmount(a.amountsByCurrency));

  return { entries };
}

/** `label` es el nombre del cliente — nunca email/teléfono (ver
 *  RevenueByClientStats en types.ts). El detalle completo vive en
 *  /admin/clients/[id], al que cada entrada debe enlazar. */
export function buildRevenueByClient(payments: Payment[], clients: Client[]): RevenueByClientStats {
  const clientNameById = new Map(clients.map((c) => [c.id, c.name]));
  const totalsByClient = new Map<string, MoneyByCurrency>();

  for (const payment of payments) {
    if (payment.status !== "APPROVED") continue;
    const existing = totalsByClient.get(payment.clientId) ?? {};
    addMoney(existing, payment.currency, payment.amount);
    totalsByClient.set(payment.clientId, existing);
  }

  const entries: RevenueByGroupEntry[] = [...totalsByClient.entries()]
    .map(([id, amountsByCurrency]) => ({
      id,
      label: clientNameById.get(id) ?? "Cliente eliminado",
      amountsByCurrency,
    }))
    .sort((a, b) => sortKeyAmount(b.amountsByCurrency) - sortKeyAmount(a.amountsByCurrency));

  return { entries };
}

export function buildRevenueByPaymentType(payments: Payment[]): RevenueByPaymentTypeStats {
  const byType: Record<PaymentType, MoneyByCurrency> = {
    DEPOSIT: {},
    BALANCE: {},
    FULL_PAYMENT: {},
    MAINTENANCE: {},
  };

  for (const payment of payments) {
    if (payment.status !== "APPROVED") continue;
    addMoney(byType[payment.paymentType], payment.currency, payment.amount);
  }

  return { byType };
}

// ---- IA / Conversaciones -------------------------------------------------

/**
 * Fase 10 — regla explícita de "conversación que genera un lead" (no
 * existía ninguna definición oficial antes de esto, ver la auditoría
 * Etapa 1): progresó más allá de "exploring" O el visitante dejó un email
 * real. Ambas señales ya alimentan leadScore/leadStatus en
 * src/lib/ai/conversation.ts — esto reutiliza ese significado, no inventa
 * uno nuevo. Nunca cuenta "cualquier conversación" como lead.
 */
export function isLeadGeneratingConversation(conversation: Pick<Conversation, "leadStatus" | "visitorEmail">): boolean {
  return conversation.leadStatus !== "exploring" || conversation.visitorEmail !== null;
}

export function buildAIConversationStats(
  conversations: Conversation[],
  period: StatisticsPeriod,
  now: Date
): AIConversationStats {
  const { start, end } = resolvePeriodRange(period, now);
  const inPeriod = conversations.filter((c) => inRange(c.createdAt, start, end));

  const leadGeneratingConversationsInPeriod = inPeriod.filter(isLeadGeneratingConversation).length;
  const leadGenerationRatePct =
    inPeriod.length > 0 ? Math.round((leadGeneratingConversationsInPeriod / inPeriod.length) * 100) : null;

  let totalMessagesInPeriod = 0;
  for (const c of inPeriod) totalMessagesInPeriod += c.messages.length;
  const averageMessagesPerConversationInPeriod =
    inPeriod.length > 0 ? Math.round((totalMessagesInPeriod / inPeriod.length) * 10) / 10 : null;

  return {
    leadGeneratingConversationsInPeriod,
    leadGenerationRatePct,
    totalMessagesInPeriod,
    averageMessagesPerConversationInPeriod,
  };
}

// ---- Mantenimiento ---------------------------------------------------

export function buildMaintenanceStats(
  requests: MaintenanceRequest[],
  payments: Payment[]
): MaintenanceStats {
  let newCount = 0;
  let contactedCount = 0;
  let resolvedCount = 0;

  for (const r of requests) {
    if (r.status === "new") newCount += 1;
    else if (r.status === "contacted") contactedCount += 1;
    else resolvedCount += 1;
  }

  const revenueByCurrency: MoneyByCurrency = {};
  for (const p of payments) {
    if (p.status === "APPROVED" && p.paymentType === "MAINTENANCE") {
      addMoney(revenueByCurrency, p.currency, p.amount);
    }
  }

  return {
    totalAllTime: requests.length,
    newCount,
    contactedCount,
    resolvedCount,
    revenueByCurrency,
  };
}
