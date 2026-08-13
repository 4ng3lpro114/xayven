import type { PromotionEffectiveStatus } from "@/lib/promotions/types";
import { PROMOTION_EFFECTIVE_STATUS_LABELS_ES } from "@/lib/promotions/effectiveStatus";

/** Same color-dot-+-label pattern as LeadStatusBadge/PaymentStatusBadge —
 *  no new visual system introduced. Colors chosen to echo the closest
 *  semantic match already used elsewhere: "active" reuses the same green
 *  as LeadStatusBadge's "client", "expired"/"archived" reuse muted tones. */
const COLORS: Record<PromotionEffectiveStatus, { fg: string; bg: string; border: string }> = {
  draft: { fg: "#a9a3b8", bg: "rgba(169,163,184,0.12)", border: "rgba(169,163,184,0.3)" },
  scheduled: { fg: "#c9a8ff", bg: "rgba(145,82,255,0.12)", border: "rgba(145,82,255,0.35)" },
  active: { fg: "#35d399", bg: "rgba(53,211,153,0.12)", border: "rgba(53,211,153,0.35)" },
  paused: { fg: "#ff9f4a", bg: "rgba(255,159,74,0.12)", border: "rgba(255,159,74,0.35)" },
  expired: { fg: "#726c82", bg: "rgba(114,108,130,0.12)", border: "rgba(114,108,130,0.3)" },
  archived: { fg: "#726c82", bg: "rgba(114,108,130,0.12)", border: "rgba(114,108,130,0.3)" },
};

export function PromotionStatusBadge({ status }: { status: PromotionEffectiveStatus }) {
  const color = COLORS[status];
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-medium"
      style={{ color: color.fg, background: color.bg, border: `1px solid ${color.border}` }}
    >
      {PROMOTION_EFFECTIVE_STATUS_LABELS_ES[status]}
    </span>
  );
}
