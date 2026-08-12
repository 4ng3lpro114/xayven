import type { Conversation, LeadStatus } from "@/lib/db/types";
import type { Client, Payment, PaymentStatus, Project } from "@/lib/payments/types";
import { pendingAmount } from "@/lib/payments/types";
import { classifyProjectWorkStage } from "@/lib/statistics/projectStages";
import { bucketLabel, bucketStartFor, enumerateBuckets, resolvePeriodRange, resolvePreviousPeriodRange } from "@/lib/statistics/period";
import type {
  ClientsStats,
  ConversionStats,
  FinanceStats,
  LeadsStats,
  MoneyByCurrency,
  NewClientsTimeSeries,
  ProjectsStats,
  ProjectWorkStage,
  RevenuePeriodStats,
  RevenueTimeSeries,
  StatisticsPeriod,
  StatisticsSnapshot,
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

export function buildProjectsStats(projects: Project[]): ProjectsStats {
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

  return { totalAllTime: projects.length, byStage, contractedByCurrency, pendingByCurrency };
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
    projects: buildProjectsStats(input.projects),
    finance: buildFinanceStats(input.projects, input.payments),
    revenuePeriod: buildRevenuePeriodStats(input.payments, input.period, now),
    leads: buildLeadsStats(input.conversations, input.period, now),
    conversion: buildConversionStats(input.conversations),
    revenueSeries: buildRevenueSeries(input.payments, input.period, now),
    newClientsSeries: buildNewClientsSeries(input.clients, input.period, now),
  };
}
