import "server-only";
import { listPromotions } from "@/lib/db/promotionStore";
import { getEffectivePromotionStatus } from "@/lib/promotions/effectiveStatus";
import type { Promotion, PromotionAudience, PublicPromotion } from "@/lib/promotions/types";

/**
 * Fase 11B — the ONE function any surface (public pages, later the chat
 * route) should call to know which promotions to show right now. Not
 * wired up to any public surface yet in this phase (see the Fase 11B
 * report) — this is the base, ready to be called once a caller exists.
 *
 * `isExistingClient` MUST be derived server-side (e.g. the current
 * conversation's `clientId !== null`, looked up by session id) — never
 * accepted as a raw boolean from client input. Undefined/unknown is
 * treated conservatively: neither "new_users" nor "existing_clients"
 * promotions match when eligibility can't be confirmed, only "all" does
 * (see the Fase 11A audit §4.2 — outside an established chat, XAYVEN has
 * no visitor login system, so "existing client" can't be claimed with
 * confidence).
 */
export interface PromotionEligibilityContext {
  isExistingClient?: boolean;
}

export function matchesAudience(
  audience: PromotionAudience,
  context: PromotionEligibilityContext
): boolean {
  if (audience === "all") return true;
  if (audience === "existing_clients") return context.isExistingClient === true;
  if (audience === "new_users") return context.isExistingClient === false;
  return false;
}

export function toPublicPromotion(promotion: Promotion): PublicPromotion {
  return {
    id: promotion.id,
    text: promotion.text,
    discountType: promotion.discountType,
    discountValue: promotion.discountValue,
    currency: promotion.currency,
    startAt: promotion.startAt,
    endAt: promotion.endAt,
    ctaLabel: promotion.ctaLabel,
    ctaMessage: promotion.ctaMessage,
  };
}

export async function getEligibleActivePromotions(
  context: PromotionEligibilityContext = {}
): Promise<PublicPromotion[]> {
  // Only "scheduled" can ever resolve to effective "active" — fetching
  // just that status, not the whole table, keeps this a single small
  // query instead of filtering draft/paused/archived rows in memory for
  // nothing (see the Fase 11A audit §12, performance).
  const candidates = await listPromotions({ status: "scheduled", limit: 1000 });
  const now = new Date();

  return candidates
    .filter((p) => getEffectivePromotionStatus(p, now) === "active")
    .filter((p) => matchesAudience(p.audience, context))
    .map(toPublicPromotion);
}
