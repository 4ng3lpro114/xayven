import type { Conversation, LeadStatusHistoryEntry } from "@/lib/db/types";

/**
 * Fase 10 (Analytics V2) — timing between real lead_status_history
 * transitions. Pure, no I/O — receives the bulk-fetched history (see
 * listAllLeadStatusHistory() in conversationStore.ts) and the
 * conversations it belongs to (needed for `createdAt`, see below), same
 * "bulk fetch once, reduce in memory" discipline as the rest of
 * src/lib/statistics/.
 *
 * lead_status_history has 0 rows as of this module's creation (deployed
 * 2026-08-12, no backfill by design — see supabase/migrations/
 * 0005_lead_status_history.sql). Every function here is written to behave
 * correctly at n=0 and to stay honest about small samples — never
 * presenting a median/average computed from a handful of rows as if it
 * were statistically representative.
 *
 * "exploring → interested" is measured from the conversation's own
 * `createdAt`, NOT from a previous history row — no "entered exploring"
 * event is ever logged (conversations start in "exploring" by default;
 * see the Fase 9C audit §K, referenced throughout leadStatus.ts). Every
 * other transition's start time is the immediately preceding history row
 * for that same conversation.
 */

export const MIN_SAMPLE_SIZE_FOR_VELOCITY_STATS = 3;

function hoursBetween(startIso: string, endIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / (1000 * 60 * 60);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export interface DurationStats {
  sampleSize: number;
  averageHours: number | null;
  medianHours: number | null;
  minHours: number | null;
  maxHours: number | null;
  p25Hours: number | null;
  p75Hours: number | null;
  /** False when sampleSize < MIN_SAMPLE_SIZE_FOR_VELOCITY_STATS. Callers
   *  MUST render an "datos insuficientes" state rather than presenting
   *  average/median/percentiles as representative when this is false —
   *  the numbers above are still returned (never hidden), just flagged. */
  isRepresentative: boolean;
}

const EMPTY_DURATION_STATS: DurationStats = {
  sampleSize: 0,
  averageHours: null,
  medianHours: null,
  minHours: null,
  maxHours: null,
  p25Hours: null,
  p75Hours: null,
  isRepresentative: false,
};

function buildDurationStats(hoursList: number[]): DurationStats {
  if (hoursList.length === 0) return EMPTY_DURATION_STATS;

  const sorted = [...hoursList].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    sampleSize: sorted.length,
    averageHours: round1(sum / sorted.length),
    medianHours: round1(median(sorted)),
    minHours: round1(sorted[0]!),
    maxHours: round1(sorted[sorted.length - 1]!),
    p25Hours: round1(percentile(sorted, 0.25)),
    p75Hours: round1(percentile(sorted, 0.75)),
    isRepresentative: sorted.length >= MIN_SAMPLE_SIZE_FOR_VELOCITY_STATS,
  };
}

export interface ConversionVelocityStats {
  exploringToInterested: DurationStats;
  interestedToHot: DurationStats;
  hotToClient: DurationStats;
  /** Conversation creation → the transition that reached "client". */
  totalTimeToConversion: DurationStats;
  /** False when lead_status_history has zero rows at all — drives the
   *  module-level "estamos recopilando datos" empty state, distinct from
   *  each DurationStats.isRepresentative (which is about sample size once
   *  there IS some data). */
  hasAnyHistoryData: boolean;
}

export function buildConversionVelocityStats(
  history: LeadStatusHistoryEntry[],
  conversations: Pick<Conversation, "id" | "createdAt">[]
): ConversionVelocityStats {
  const hasAnyHistoryData = history.length > 0;
  const createdAtById = new Map(conversations.map((c) => [c.id, c.createdAt]));

  const byConversation = new Map<string, LeadStatusHistoryEntry[]>();
  for (const entry of history) {
    const list = byConversation.get(entry.conversationId);
    if (list) list.push(entry);
    else byConversation.set(entry.conversationId, [entry]);
  }

  const exploringToInterestedHours: number[] = [];
  const interestedToHotHours: number[] = [];
  const hotToClientHours: number[] = [];
  const totalTimeHours: number[] = [];

  for (const [conversationId, entries] of byConversation) {
    const sorted = [...entries].sort((a, b) => a.changedAt.localeCompare(b.changedAt));
    const createdAt = createdAtById.get(conversationId);

    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i]!;
      const previous = i > 0 ? sorted[i - 1]! : null;

      if (entry.fromStatus === "exploring" && entry.toStatus === "interested" && createdAt) {
        const hours = hoursBetween(createdAt, entry.changedAt);
        if (hours >= 0) exploringToInterestedHours.push(hours);
      }

      if (
        previous &&
        previous.toStatus === entry.fromStatus &&
        entry.fromStatus === "interested" &&
        entry.toStatus === "hot"
      ) {
        const hours = hoursBetween(previous.changedAt, entry.changedAt);
        if (hours >= 0) interestedToHotHours.push(hours);
      }

      if (
        previous &&
        previous.toStatus === entry.fromStatus &&
        entry.fromStatus === "hot" &&
        entry.toStatus === "client"
      ) {
        const hours = hoursBetween(previous.changedAt, entry.changedAt);
        if (hours >= 0) hotToClientHours.push(hours);
      }

      if (entry.toStatus === "client" && createdAt) {
        const hours = hoursBetween(createdAt, entry.changedAt);
        if (hours >= 0) totalTimeHours.push(hours);
      }
    }
  }

  return {
    exploringToInterested: buildDurationStats(exploringToInterestedHours),
    interestedToHot: buildDurationStats(interestedToHotHours),
    hotToClient: buildDurationStats(hotToClientHours),
    totalTimeToConversion: buildDurationStats(totalTimeHours),
    hasAnyHistoryData,
  };
}
