import type { StatisticsBucket, StatisticsPeriod } from "@/lib/statistics/types";

/**
 * Period → date-range/bucket resolution, pure and no I/O. All date math is
 * done in UTC (the DB stores timestamptz; bucketing in UTC avoids DST
 * edge cases) — only display labels use es-CO locale formatting.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const PERIOD_DAYS: Record<Exclude<StatisticsPeriod, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "3m": 90,
  "6m": 182,
  "1y": 365,
};

const PERIOD_BUCKET: Record<Exclude<StatisticsPeriod, "all">, StatisticsBucket> = {
  "7d": "day",
  "30d": "day",
  "3m": "week",
  "6m": "week",
  "1y": "month",
};

export interface PeriodRange {
  /** null only for "all" — the caller resolves the real lower bound from
   *  the specific dataset being charted (see aggregate.ts), never an
   *  arbitrary fixed date. */
  start: Date | null;
  end: Date;
  bucket: StatisticsBucket;
}

export function resolvePeriodRange(period: StatisticsPeriod, now: Date): PeriodRange {
  if (period === "all") {
    return { start: null, end: now, bucket: "month" };
  }
  const days = PERIOD_DAYS[period];
  return { start: new Date(now.getTime() - days * DAY_MS), end: now, bucket: PERIOD_BUCKET[period] };
}

/**
 * The immediately-preceding window of the same length — used ONLY for
 * simple creation-count/received-amount deltas (e.g. "new clients this
 * period vs. last"). Never used to imply a historical snapshot of a
 * cumulative total. Returns null for "all" (no meaningful previous
 * window) and for any period whose days can't be resolved.
 */
export function resolvePreviousPeriodRange(
  period: StatisticsPeriod,
  now: Date
): { start: Date; end: Date } | null {
  if (period === "all") return null;
  const days = PERIOD_DAYS[period];
  const end = new Date(now.getTime() - days * DAY_MS);
  const start = new Date(end.getTime() - days * DAY_MS);
  return { start, end };
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addBucket(d: Date, bucket: StatisticsBucket): Date {
  if (bucket === "day") return new Date(d.getTime() + DAY_MS);
  if (bucket === "week") return new Date(d.getTime() + 7 * DAY_MS);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

/** Which bucket a given timestamp belongs to, as that bucket's own start
 *  date — used both to enumerate buckets and to key individual points
 *  into them. */
export function bucketStartFor(date: Date, seriesStart: Date, bucket: StatisticsBucket): Date {
  if (bucket === "month") return startOfUtcMonth(date);
  const anchor = bucket === "day" ? startOfUtcDay(seriesStart) : seriesStart;
  const size = bucket === "day" ? DAY_MS : 7 * DAY_MS;
  const offset = Math.floor((date.getTime() - anchor.getTime()) / size);
  return new Date(anchor.getTime() + offset * size);
}

/** Every bucket start from `start` to `end` inclusive, in order. Bounded
 *  defensively (max 400 buckets) — a malformed/huge range fails safe
 *  rather than generating an unbounded array. */
export function enumerateBuckets(start: Date, end: Date, bucket: StatisticsBucket): Date[] {
  const anchor = bucket === "day" ? startOfUtcDay(start) : bucket === "month" ? startOfUtcMonth(start) : start;
  const out: Date[] = [];
  let cursor = anchor;
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard < 400) {
    out.push(cursor);
    cursor = addBucket(cursor, bucket);
    guard += 1;
  }
  if (out.length === 0) out.push(anchor);
  return out;
}

const DAY_LABEL = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", timeZone: "UTC" });
const MONTH_LABEL = new Intl.DateTimeFormat("es-CO", { month: "short", year: "numeric", timeZone: "UTC" });

export function bucketLabel(date: Date, bucket: StatisticsBucket): string {
  if (bucket === "month") return MONTH_LABEL.format(date);
  return DAY_LABEL.format(date);
}
