import type { Promotion, PromotionEffectiveStatus } from "@/lib/promotions/types";

/**
 * Fase 11B — the ONE function allowed to turn a stored PromotionStatus +
 * dates into what's actually shown anywhere (admin UI, public consumption,
 * later AI eligibility). Pure, no I/O, no cron — "active"/"expired" are
 * NEVER written to the database; they only ever exist as this function's
 * return value, recomputed on every single read. Same principle already
 * used by classifyProjectWorkStage() in src/lib/statistics/projectStages.ts
 * — a scheduled promotion becomes "active" the instant `now` crosses
 * start_at, with zero code running at that exact moment.
 *
 * `draft` and `paused` are absolute — never active regardless of dates,
 * exactly as specified. `archived` is likewise absolute and terminal.
 * Only `scheduled` actually consults the dates.
 */
export function getEffectivePromotionStatus(
  promotion: Pick<Promotion, "status" | "startAt" | "endAt">,
  now: Date
): PromotionEffectiveStatus {
  if (promotion.status === "draft") return "draft";
  if (promotion.status === "paused") return "paused";
  if (promotion.status === "archived") return "archived";

  // promotion.status === "scheduled" — the only case where dates decide.
  const nowMs = now.getTime();
  const startMs = new Date(promotion.startAt).getTime();
  const endMs = new Date(promotion.endAt).getTime();

  if (nowMs < startMs) return "scheduled";
  if (nowMs > endMs) return "expired";
  return "active";
}

export const PROMOTION_EFFECTIVE_STATUS_LABELS_ES: Record<PromotionEffectiveStatus, string> = {
  draft: "Borrador",
  scheduled: "Programada",
  active: "Activa",
  paused: "Pausada",
  expired: "Finalizada",
  archived: "Archivada",
};
