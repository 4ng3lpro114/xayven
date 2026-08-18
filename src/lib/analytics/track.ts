"use client";

import type { AnalyticsEventType } from "@/lib/analytics/types";

/**
 * Analytics Phase 7 — the one client-side entry point every tracked
 * component calls (TrackView.tsx, TrackedCtaLink.tsx, ServiceAiCtaButton
 * .tsx). Fire-and-forget by design: `keepalive: true` lets the request
 * survive a click-triggered navigation, errors are always swallowed —
 * a tracking failure must never surface to the visitor or block
 * anything else on the page (same reasoning as
 * analyticsEventStore.ts's recordAnalyticsEvent()).
 */
export function trackEvent(
  eventType: AnalyticsEventType,
  payload?: { serviceSlug?: string; packageSlug?: string; sessionId?: string; locale?: string }
): void {
  try {
    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, ...payload }),
      keepalive: true,
    }).catch(() => {
      // Ignore — see module doc comment.
    });
  } catch {
    // Ignore — same reasoning, covers environments without fetch/keepalive.
  }
}
