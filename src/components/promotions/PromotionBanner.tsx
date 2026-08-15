import { Sparkles } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { getEligibleActivePromotions } from "@/lib/promotions/eligibility";
import { formatPromotionDiscount } from "@/lib/promotions/format";
import { PromotionCtaButton } from "@/components/promotions/PromotionCtaButton";

const END_DATE_FORMAT = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short" });

/**
 * Fase 11 Etapa A — "PROMOCIÓN → VISIBILIDAD PÚBLICA". Server Component,
 * rendered once in [locale]/layout.tsx (same place ChatWidget/Header
 * already render global site chrome) so it shows consistently across the
 * public site instead of living on an isolated page.
 *
 * Reuses getEligibleActivePromotions() as-is (no new status/eligibility
 * logic) — that function ALREADY filters to draft/archived/paused/
 * out-of-date/wrong-audience-excluded, real-time, via
 * getEffectivePromotionStatus() + matchesAudience(). No visitor-login
 * system exists outside an active chat, so this call passes no context —
 * matching the documented conservative default (only `audience: "all"`
 * promotions can ever show here; see eligibility.ts).
 *
 * Deliberately shows AT MOST ONE promotion, even if several are eligible
 * at once (the most recently created — listPromotions() already orders
 * by created_at desc, untouched here) — a scope decision to keep this a
 * slim, unobtrusive banner rather than a stacked list; documented here
 * rather than silently assumed.
 */
export async function PromotionBanner() {
  const promotions = await getEligibleActivePromotions();
  const promotion = promotions[0];
  if (!promotion) return null;

  // ctaMessage is reserved specifically for this handoff (see
  // Promotion.ctaMessage's doc comment in types.ts) — falls back to the
  // promotion's own visitor-facing `text` when the admin left it empty,
  // so the chat handoff always has a real, non-empty first message.
  const message = promotion.ctaMessage ?? promotion.text;

  return (
    <div className="border-b border-border-accent bg-bg-elevated/60">
      <Container className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 py-3 text-center sm:justify-between sm:text-left">
        <div className="flex items-center gap-2.5">
          <Sparkles className="size-4 shrink-0 text-accent-300" aria-hidden="true" />
          <p className="text-sm text-fg">
            <span className="font-mono font-semibold text-accent-300">
              {formatPromotionDiscount(promotion)}
            </span>{" "}
            <span className="text-fg-muted">{promotion.text}</span>{" "}
            <span className="text-xs text-fg-subtle">
              · Válida hasta {END_DATE_FORMAT.format(new Date(promotion.endAt))}
            </span>
          </p>
        </div>
        <PromotionCtaButton promotionId={promotion.id} message={message} label={promotion.ctaLabel} />
      </Container>
    </div>
  );
}
