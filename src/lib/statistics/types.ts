import type { LeadStatus } from "@/lib/db/types";
import type { PaymentStatus } from "@/lib/payments/types";

/**
 * Statistics domain types (Fase 7B) — see src/lib/statistics/aggregate.ts
 * for the module-level explanation of what's period-scoped vs. all-time,
 * and docs/ (Fase 7A audit) for why certain metrics (país, método de pago
 * específico, conversión histórica) are deliberately absent.
 */

export type StatisticsPeriod = "7d" | "30d" | "3m" | "6m" | "1y" | "all";

export const STATISTICS_PERIODS: { key: StatisticsPeriod; label: string }[] = [
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "3m", label: "3 meses" },
  { key: "6m", label: "6 meses" },
  { key: "1y", label: "1 año" },
  { key: "all", label: "Todo" },
];

export type StatisticsBucket = "day" | "week" | "month";

/** Amounts keyed by ISO currency code — NEVER summed across currencies.
 *  Same convention as MoneyByCurrency in src/lib/clients/summary.ts. */
export type MoneyByCurrency = Record<string, number>;

/**
 * How a real `ProjectStatus` is grouped for the "Trabajos" section — see
 * classifyProjectWorkStage() in projectStages.ts for the documented
 * reasoning behind each bucket. `cancelled` is deliberately its own
 * bucket, never folded into "pending" (that would inflate backlog with
 * work that isn't actually coming) nor into "completed".
 */
export type ProjectWorkStage = "completed" | "in_progress" | "pending" | "cancelled";

export interface ClientsStats {
  /** Current total — NOT period-scoped (see Fase 7A audit §9: this is a
   *  snapshot of right now, not a claim about any past date). */
  totalAllTime: number;
  /** Clients whose created_at falls inside the selected period. */
  newInPeriod: number;
  /** Clients created in the immediately-preceding window of equal length
   *  — null when the period is "all" (no meaningful "previous" window) or
   *  when it can't be computed confidently. */
  newInPreviousPeriod: number | null;
  /** null when newInPreviousPeriod is null OR is 0 (a % over zero is not
   *  a real growth rate — never fabricated as +Infinity or similar). */
  growthPct: number | null;
}

export interface ProjectsStats {
  totalAllTime: number;
  byStage: Record<ProjectWorkStage, number>;
  /** sum(total_amount) across ALL projects ever created — "lo que hemos
   *  contratado", not "lo que hemos cobrado". */
  contractedByCurrency: MoneyByCurrency;
  /** sum(totalAmount - paidAmount) across all NON-cancelled projects — a
   *  cancelled project's balance isn't realistically collectible, so it's
   *  excluded (see projectStages.ts). */
  pendingByCurrency: MoneyByCurrency;
}

export interface FinanceStats {
  /** All-time. Same value as ProjectsStats.contractedByCurrency — kept as
   *  its own field so the Finanzas section doesn't need to reach into
   *  ProjectsStats to render itself. */
  contractedByCurrency: MoneyByCurrency;
  /** All-time. THE source of truth for money actually received —
   *  sum(payments.amount) WHERE status = 'APPROVED', across every
   *  payment_type (including MAINTENANCE). Deliberately never derived
   *  from projects.paid_amount, which excludes MAINTENANCE payments by
   *  design (see src/lib/payments/service.ts applyProviderStatus) and
   *  would under-count real income the moment one exists. */
  receivedByCurrency: MoneyByCurrency;
  /** All-time. Same value as ProjectsStats.pendingByCurrency. */
  pendingByCurrency: MoneyByCurrency;
  averageApprovedTicketByCurrency: MoneyByCurrency;
  paymentsByStatus: Record<PaymentStatus, number>;
  approvedPaymentsCount: number;
}

export interface RevenuePeriodStats {
  /** sum(payments.amount) WHERE status='APPROVED' AND updated_at falls in
   *  the selected period — updated_at is used, not created_at, because a
   *  payment's updated_at is frozen the moment it reaches a terminal
   *  status (see applyProviderStatus's TERMINAL_PAYMENT_STATUSES guard),
   *  making it a reliable proxy for "date actually approved" (Fase 7A
   *  audit §8). */
  receivedByCurrency: MoneyByCurrency;
  approvedPaymentsCount: number;
  /** null when the period is "all" (no previous window) or when there's
   *  nothing to compare against in the dominant currency. */
  growthPct: number | null;
}

export interface LeadsStats {
  totalAllTime: number;
  newInPeriod: number;
  /** CURRENT distribution of lead_status — a snapshot, not a history (see
   *  Fase 7A audit §3/§9: conversations.lead_status is overwritten in
   *  place, no transition log exists). */
  byStatus: Record<LeadStatus, number>;
  /** Average leadScore of conversations CREATED within the period — null
   *  when there are none. This reflects "how promising were the leads we
   *  got in this period", not "how hot leads are/were on some past date"
   *  (leadScore itself is only ever the CURRENT value, see audit §3). */
  averageScoreInPeriod: number | null;
}

/**
 * Deliberately NEVER period-scoped — see aggregate.ts and the audit
 * (§3/§9/§11): there is no `converted_at` timestamp anywhere, so a
 * lead→client conversion can't be dated. This is the best honest answer
 * available: an all-time, current-state ratio.
 */
export interface ConversionStats {
  conversationsTotal: number;
  /** Distinct clients reached via conversations.client_id (not a raw
   *  conversation count — a client with two linked conversations must
   *  still count once). Clients created directly (never via a lead
   *  conversation) are correctly excluded — they were never a lead. */
  convertedClientsCount: number;
  conversionRatePct: number | null;
}

export interface TimeSeriesPoint {
  /** ISO date of the bucket's start. */
  date: string;
  /** Short, locale-formatted label for axis/tooltip display. */
  label: string;
  value: number;
}

export interface RevenueTimeSeries {
  bucket: StatisticsBucket;
  /** null when there is no APPROVED payment at all in the period — the
   *  caller must render an empty state, never a flat zero-line chart
   *  pretending there was activity. */
  currency: string | null;
  points: TimeSeriesPoint[];
  /** Currencies that DID have approved payments in the period but were
   *  excluded from this single-currency chart (never silently dropped
   *  without disclosure — see aggregate.ts). */
  otherCurrenciesExcluded: string[];
}

export interface NewClientsTimeSeries {
  bucket: StatisticsBucket;
  points: TimeSeriesPoint[];
}

export interface StatisticsSnapshot {
  period: StatisticsPeriod;
  periodLabel: string;
  rangeStart: string | null;
  rangeEnd: string;
  clients: ClientsStats;
  projects: ProjectsStats;
  finance: FinanceStats;
  revenuePeriod: RevenuePeriodStats;
  leads: LeadsStats;
  conversion: ConversionStats;
  revenueSeries: RevenueTimeSeries;
  newClientsSeries: NewClientsTimeSeries;
}
