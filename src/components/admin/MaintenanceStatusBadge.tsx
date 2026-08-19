import type { MaintenanceRequest } from "@/lib/db/types";

/** Same color-dot-+-label pattern as ContactRequestStatusBadge/
 *  PromotionStatusBadge/LeadStatusBadge — no new visual system introduced.
 *  "resolved" reuses the same green as ContactRequestStatusBadge's
 *  "converted" — same underlying fact (this is done), same color
 *  language. */
const LABELS: Record<MaintenanceRequest["status"], string> = {
  new: "Nueva",
  contacted: "Contactada",
  resolved: "Resuelta",
};

const COLORS: Record<MaintenanceRequest["status"], { fg: string; bg: string; border: string }> = {
  new: { fg: "#c9a8ff", bg: "rgba(145,82,255,0.12)", border: "rgba(145,82,255,0.35)" },
  contacted: { fg: "#ff9f4a", bg: "rgba(255,159,74,0.12)", border: "rgba(255,159,74,0.35)" },
  resolved: { fg: "#35d399", bg: "rgba(53,211,153,0.12)", border: "rgba(53,211,153,0.35)" },
};

export function MaintenanceStatusBadge({ status }: { status: MaintenanceRequest["status"] }) {
  const color = COLORS[status];
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-medium"
      style={{ color: color.fg, background: color.bg, border: `1px solid ${color.border}` }}
    >
      {LABELS[status]}
    </span>
  );
}
