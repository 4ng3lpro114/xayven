import type { LeadStatus } from "@/lib/db/types";
import type { PaymentStatus, PaymentType, ProjectStatus } from "@/lib/payments/types";

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
  /** Fase 10 — projects whose createdAt falls inside the selected period.
   *  Everything else on this interface stays deliberately all-time (see
   *  the original Fase 7B reasoning below); this one field is the
   *  exception because "proyectos creados" is explicitly a Resumen
   *  Ejecutivo card that must respect the period selector. */
  newInPeriod: number;
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

/**
 * Fase 10 — the ONE resumen-level extension to ConversionStats: conversions
 * attributable to the selected period via `converted_at`. Deliberately its
 * own type, not a field bolted onto ConversionStats, because the two have
 * different honesty rules: ConversionStats is a pure all-time snapshot (no
 * date involved at all), while this one is period-scoped AND must
 * separately surface how many all-time conversions have NO date to place
 * anywhere (converted_at IS NULL — pre-Fase-9B conversions). That count is
 * never distributed into any period, never treated as "now".
 */
export interface ConversionPeriodStats {
  /** Conversions whose converted_at falls inside the selected period. */
  convertedInPeriod: number;
  /** All-time, NOT period-scoped — conversions that happened before
   *  converted_at existed (0004_conversations_converted_at.sql), so their
   *  real date is genuinely unknown. Always surfaced, never silently
   *  dropped from the historical total and never guessed at. */
  unknownDateConversionsAllTime: number;
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
  conversionPeriod: ConversionPeriodStats;
  revenueSeries: RevenueTimeSeries;
  newClientsSeries: NewClientsTimeSeries;
}

// ---------------------------------------------------------------------------
// Fase 10 — Analytics V2. Everything below is additive: new tab-scoped data
// shapes, computed only when their tab is active (see page.tsx) — never
// bundled into StatisticsSnapshot itself, which stays the Resumen tab's
// shape. Same MoneyByCurrency/empty-state/no-invented-data discipline
// throughout.
// ---------------------------------------------------------------------------

// ---- Funnel ---------------------------------------------------------------

export type FunnelStageKey = "conversations" | "exploring" | "interested" | "hot" | "client";

export interface FunnelStagePoint {
  key: FunnelStageKey;
  label: string;
  /** Cumulative "reach" — conversations at this stage or beyond. This is
   *  the number the bar width/funnel shape is driven by. See the doc
   *  comment on buildFunnelSnapshot() in aggregate.ts. */
  count: number;
  /** The OTHER number (Fase 10, opción 3 aprobada): conversations whose
   *  `lead_status` is literally this exact value right now — the same raw,
   *  non-cumulative count already shown in the Leads tab's "Por estado"
   *  pills (never a different definition, never recomputed differently).
   *  For "conversations" and "client" this always equals `count` by
   *  construction (there's nothing "beyond" client, and every conversation
   *  is definitionally at least at "conversations") — shown anyway, for
   *  every stage, per explicit instruction; it's simply uninformative
   *  there, never wrong. */
  exactCount: number;
  /** null for the first stage (no previous stage to compare against). */
  pctOfPrevious: number | null;
  /** null when the top-of-funnel count is 0 — never a division by zero. */
  pctOfTotal: number | null;
}

export interface FunnelSnapshot {
  stages: FunnelStagePoint[];
  /** Conversations currently in "support" — deliberately excluded from
   *  the funnel/drop-off math above (support isn't a commercial pipeline
   *  stage), shown separately so the count isn't lost. */
  supportCount: number;
}

export interface FunnelEvolutionSeries {
  bucket: StatisticsBucket;
  reachedInterested: TimeSeriesPoint[];
  reachedHot: TimeSeriesPoint[];
  reachedClient: TimeSeriesPoint[];
  /** False when lead_status_history has zero rows in the selected period
   *  — in practice, zero rows at all today (deployed 2026-08-12, no
   *  backfill). Drives an explicit "el historial empezará a aparecer..."
   *  empty state — never a flat zero-line chart implying past activity
   *  that was never recorded. */
  hasData: boolean;
}

export interface FunnelStats {
  snapshot: FunnelSnapshot;
  evolution: FunnelEvolutionSeries;
}

// ---- Additional time series -------------------------------------------

export interface LeadsTimeSeries {
  bucket: StatisticsBucket;
  points: TimeSeriesPoint[];
}

export interface ProjectsTimeSeries {
  bucket: StatisticsBucket;
  points: TimeSeriesPoint[];
}

export interface ConversionsTimeSeries {
  bucket: StatisticsBucket;
  /** Only conversions with a known converted_at — see
   *  unknownDateConversionsAllTime for what's deliberately NOT here. */
  points: TimeSeriesPoint[];
  unknownDateConversionsAllTime: number;
}

// ---- Clients (extended) ----------------------------------------------

export interface ClientsExtendedStats {
  withProjectsCount: number;
  /** Clients with more than one project — see ClientSummary.projectsCount
   *  (src/lib/clients/summary.ts), already computed per client. */
  recurringCount: number;
  /** Sum of every client's ClientSummary.paidAmount, by currency. Never
   *  attaches a name/email here — per-client PII stays on
   *  /admin/clients/[id]. */
  totalPaidByCurrency: MoneyByCurrency;
}

// ---- Projects (extended) -----------------------------------------------

/** The real 9 ProjectStatus values, unlike ProjectsStats.byStage's 4-bucket
 *  grouping — an optional, more granular view (see projectStages.ts for
 *  why "active"/"in_progress"/"review"/"maintenance" all fold into a
 *  single "in_progress" bucket normally). */
export type ProjectRawStatusBreakdown = Record<ProjectStatus, number>;

// ---- Finance breakdowns -------------------------------------------------

export interface RevenueByGroupEntry {
  id: string;
  label: string;
  amountsByCurrency: MoneyByCurrency;
}

export interface RevenueByProjectStats {
  entries: RevenueByGroupEntry[];
}

/** `label` is the client's name — necessary for the ranking to be
 *  meaningful to the admin, never email/phone (those stay on
 *  /admin/clients/[id], which each entry's `id` links to). */
export interface RevenueByClientStats {
  entries: RevenueByGroupEntry[];
}

export interface RevenueByPaymentTypeStats {
  byType: Record<PaymentType, MoneyByCurrency>;
}

// ---- AI / Conversaciones -------------------------------------------------

export const PAYMENT_TYPE_LABELS_ES: Record<PaymentType, string> = {
  DEPOSIT: "Depósito",
  BALANCE: "Saldo",
  FULL_PAYMENT: "Pago completo",
  MAINTENANCE: "Mantenimiento",
};

export interface AIConversationStats {
  /**
   * Fase 10 explicit rule for "conversación que genera un lead" (no
   * official definition existed anywhere in the project before this): a
   * conversation counts as lead-generating if it progressed past pure
   * "exploring" (leadStatus !== 'exploring') OR the visitor left a real
   * email — either signal already drives leadScore/leadStatus elsewhere
   * (src/lib/ai/conversation.ts), so this reuses existing meaning rather
   * than inventing a new one. Never "any conversation counts".
   */
  leadGeneratingConversationsInPeriod: number;
  leadGenerationRatePct: number | null;
  totalMessagesInPeriod: number;
  averageMessagesPerConversationInPeriod: number | null;
}

// ---- Mantenimiento ---------------------------------------------------

export interface MaintenanceStats {
  totalAllTime: number;
  newCount: number;
  contactedCount: number;
  resolvedCount: number;
  /** payments WHERE payment_type = 'MAINTENANCE' AND status = 'APPROVED',
   *  all-time. Never a plan/price figure — no pricing model exists (see
   *  the Fase 10 Etapa 1 audit); Essential/Growth/Care+ are deliberately
   *  out of scope here. */
  revenueByCurrency: MoneyByCurrency;
}
