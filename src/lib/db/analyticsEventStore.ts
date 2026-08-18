import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/db/supabase";
import { getGlobalArray } from "@/lib/db/memoryStore";
import type { AnalyticsEvent, RecordAnalyticsEventInput } from "@/lib/analytics/types";

/**
 * Analytics events persistence — Supabase when configured, in-memory
 * fallback otherwise (same shape as every other store in this codebase).
 *
 * Deliberate EXCEPTION to this codebase's usual "never fall back to
 * memory / never swallow a real Supabase error" discipline
 * (promotionStore.ts, servicesStore.ts, pricingCatalogStore.ts all throw
 * on a real write failure): analytics events are fire-and-forget by
 * design. Losing one page-view or CTA-click event on a transient DB
 * error is low-stakes and must NEVER break the visitor's page, block a
 * chat turn, or surface an error anywhere public. That's a different
 * risk profile than a payment or a lead silently disappearing — this is
 * the one store in the codebase where "best-effort, log and continue" is
 * the correct behavior, not a shortcut.
 */

const memoryStore = getGlobalArray<AnalyticsEvent>("analytics.events");

function nowIso(): string {
  return new Date().toISOString();
}

interface AnalyticsEventRow {
  id: string;
  created_at: string;
  event_type: string;
  service_slug: string | null;
  package_slug: string | null;
  session_id: string | null;
  locale: string | null;
  metadata: Record<string, unknown>;
}

function rowToEvent(row: AnalyticsEventRow): AnalyticsEvent {
  return {
    id: row.id,
    createdAt: row.created_at,
    eventType: row.event_type as AnalyticsEvent["eventType"],
    serviceSlug: row.service_slug,
    packageSlug: row.package_slug,
    sessionId: row.session_id,
    locale: row.locale,
    metadata: row.metadata ?? {},
  };
}

/** Never throws — a tracking write must never break the caller (the
 *  public /api/analytics/event route always responds 200 regardless of
 *  whether this actually landed). Errors are logged, not surfaced. */
export async function recordAnalyticsEvent(input: RecordAnalyticsEventInput): Promise<void> {
  const supabase = getSupabaseAdmin();
  const event: AnalyticsEvent = {
    id: randomUUID(),
    createdAt: nowIso(),
    eventType: input.eventType,
    serviceSlug: input.serviceSlug,
    packageSlug: input.packageSlug,
    sessionId: input.sessionId,
    locale: input.locale,
    metadata: input.metadata,
  };

  if (!supabase) {
    memoryStore.push(event);
    return;
  }

  const { error } = await supabase.from("analytics_events").insert({
    id: event.id,
    event_type: event.eventType,
    service_slug: event.serviceSlug,
    package_slug: event.packageSlug,
    session_id: event.sessionId,
    locale: event.locale,
    metadata: event.metadata,
  });

  if (error) {
    console.error("[analytics] recordAnalyticsEvent failed:", error.code, error.message);
  }
}

export async function listAnalyticsEvents(options?: { limit?: number }): Promise<AnalyticsEvent[]> {
  const supabase = getSupabaseAdmin();
  const limit = options?.limit ?? 5000;

  if (!supabase) {
    return [...memoryStore].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  const { data } = await supabase
    .from("analytics_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => rowToEvent(row as AnalyticsEventRow));
}
