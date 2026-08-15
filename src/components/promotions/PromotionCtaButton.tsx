"use client";

import { Button } from "@/components/ui/Button";
import { setPromotionContext, openChatWidget } from "@/lib/ai/clientSession";

/**
 * Fase 11 Etapa A — the public CTA half of "Promoción → CTA → XAYVEN AI".
 * Reuses the EXACT same handoff mechanism DiagnosisTool.tsx already
 * established (setXContext() + openChatWidget()), never a new chat-opening
 * system — see clientSession.ts.
 *
 * `promotionId` travels only as a closure value inside this client
 * component's props/click handler (the same way admin's
 * PromotionActionButton already receives it) — it is never rendered as
 * visible text on the page.
 */
export function PromotionCtaButton({
  promotionId,
  message,
  label,
}: {
  promotionId: string;
  /** What the visitor's first chat message will say — see
   *  PromotionBanner.tsx for how this is derived from
   *  ctaMessage/text. */
  message: string;
  label: string;
}) {
  function handleClick() {
    setPromotionContext({ promotionId, message });
    openChatWidget();
  }

  return (
    <Button type="button" variant="primary" size="md" onClick={handleClick}>
      {label}
    </Button>
  );
}
