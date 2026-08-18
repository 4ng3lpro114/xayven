/**
 * Analytics Phase 7 — domain model. Mirrors the structure of
 * src/lib/pricing/types.ts / src/lib/services/types.ts (each domain gets
 * its own file). See supabase/migrations/0019_analytics_events.sql for
 * the exact schema.
 *
 * Exactly the 7 minimum events the master prompt names in §32 — never
 * add a new event_type here without a matching migration widening the
 * DB CHECK, same discipline as every other closed enum in this
 * codebase.
 */
export const ANALYTICS_EVENT_TYPES = [
  "service_page_view",
  "service_ai_cta",
  "service_project_cta",
  "maintenance_plan_view",
  "maintenance_cta",
  "pricing_package_view",
  "pricing_package_cta",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export interface AnalyticsEvent {
  id: string;
  createdAt: string;
  eventType: AnalyticsEventType;
  /** All nullable — only the fields relevant to a given eventType are
   *  ever set by a real caller (see track.ts). */
  serviceSlug: string | null;
  packageSlug: string | null;
  sessionId: string | null;
  locale: string | null;
  metadata: Record<string, unknown>;
}

export type RecordAnalyticsEventInput = Omit<AnalyticsEvent, "id" | "createdAt">;
