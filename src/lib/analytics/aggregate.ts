import { ANALYTICS_EVENT_TYPES, type AnalyticsEvent, type AnalyticsEventType } from "@/lib/analytics/types";

/**
 * Analytics Phase 7 — pure aggregation, same "bulk fetch + in-memory
 * reduce" discipline as every function in lib/statistics/aggregate.ts.
 * Own file (not merged into that one) — same "each domain gets its own
 * file" convention already used throughout this arc.
 */
export interface AnalyticsFunnelStats {
  countsByType: Record<AnalyticsEventType, number>;
  topServicesByView: { slug: string; count: number }[];
  topPackagesByCta: { slug: string; count: number }[];
}

export function buildAnalyticsFunnelStats(events: readonly AnalyticsEvent[]): AnalyticsFunnelStats {
  const countsByType = Object.fromEntries(
    ANALYTICS_EVENT_TYPES.map((type) => [type, 0])
  ) as Record<AnalyticsEventType, number>;

  const serviceViewCounts = new Map<string, number>();
  const packageCtaCounts = new Map<string, number>();

  for (const event of events) {
    countsByType[event.eventType] += 1;

    if (event.eventType === "service_page_view" && event.serviceSlug) {
      serviceViewCounts.set(event.serviceSlug, (serviceViewCounts.get(event.serviceSlug) ?? 0) + 1);
    }
    if (event.eventType === "pricing_package_cta" && event.packageSlug) {
      packageCtaCounts.set(event.packageSlug, (packageCtaCounts.get(event.packageSlug) ?? 0) + 1);
    }
  }

  const topServicesByView = [...serviceViewCounts.entries()]
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => b.count - a.count);

  const topPackagesByCta = [...packageCtaCounts.entries()]
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => b.count - a.count);

  return { countsByType, topServicesByView, topPackagesByCta };
}
