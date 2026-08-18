"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { openChatWidget } from "@/lib/ai/clientSession";
import { trackEvent } from "@/lib/analytics/track";
import type { AnalyticsEventType } from "@/lib/analytics/types";

/**
 * Generic "open XAYVEN AI" CTA — no context handoff, unlike
 * DiagnosisTool.tsx/PromotionCtaButton.tsx (which call
 * setDiagnosisContext()/setPromotionContext() before opening). Used where
 * the visitor hasn't picked a specific service/topic yet (Services
 * index — "not sure which service you need?"), so there's nothing
 * specific to hand off. Per-service context (servicePageSlug) is a
 * Services Phase 3 concern (see the master prompt §29), not this one —
 * reuses the exact same openChatWidget() primitive, no new mechanism.
 *
 * Analytics Phase 7: `trackEventType` is optional — only the Maintenance
 * page passes `"maintenance_cta"` (its own minimum event, §32). The
 * Services index usage stays untouched (no event in the master prompt's
 * minimum list for that CTA), so it simply omits the prop.
 */
export function OpenChatButton({
  children,
  variant = "secondary",
  trackEventType,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  trackEventType?: AnalyticsEventType;
}) {
  function handleClick() {
    if (trackEventType) trackEvent(trackEventType);
    openChatWidget();
  }

  return (
    <Button type="button" variant={variant} withArrow onClick={handleClick}>
      {children}
    </Button>
  );
}
