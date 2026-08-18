"use client";

import { Button } from "@/components/ui/Button";
import { setServiceContext, openChatWidget } from "@/lib/ai/clientSession";
import { trackEvent } from "@/lib/analytics/track";

/**
 * Services Phase 3 — the public CTA half of "Service detail → CTA →
 * XAYVEN AI". Reuses the EXACT same handoff mechanism
 * DiagnosisTool.tsx/PromotionCtaButton.tsx already established
 * (setXContext() + openChatWidget()), never a new chat-opening system —
 * see clientSession.ts.
 */
export function ServiceAiCtaButton({
  slug,
  message,
  label,
}: {
  /** The service's slug — travels only as a closure value inside this
   *  client component's click handler, never rendered as visible text. */
  slug: string;
  /** What the visitor's first chat message will say. */
  message: string;
  label: string;
}) {
  function handleClick() {
    trackEvent("service_ai_cta", { serviceSlug: slug });
    setServiceContext({ slug, message });
    openChatWidget();
  }

  return (
    <Button type="button" variant="secondary" withArrow onClick={handleClick}>
      {label}
    </Button>
  );
}
