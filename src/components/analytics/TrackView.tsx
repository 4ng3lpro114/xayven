"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics/track";
import type { AnalyticsEventType } from "@/lib/analytics/types";

/**
 * Analytics Phase 7 — fires one tracking event on mount, renders
 * nothing. Used for the "_view" events (service_page_view,
 * maintenance_plan_view, pricing_package_view) from Server Component
 * pages that can't attach client event handlers themselves — same
 * "small client wrapper, not a whole-page client component" pattern
 * already established by OpenChatButton.tsx/ServiceAiCtaButton.tsx.
 */
export function TrackView({
  eventType,
  serviceSlug,
  packageSlug,
}: {
  eventType: AnalyticsEventType;
  serviceSlug?: string;
  packageSlug?: string;
}) {
  useEffect(() => {
    trackEvent(eventType, { serviceSlug, packageSlug });
    // Fires once per mount only — a serviceSlug/packageSlug never
    // changes without the component itself remounting (new page/key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
