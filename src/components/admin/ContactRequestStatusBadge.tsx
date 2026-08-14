import type { ContactRequest } from "@/lib/db/types";

/** Same color-dot-+-label pattern as PromotionStatusBadge/LeadStatusBadge
 *  — no new visual system introduced. "converted" reuses the same green
 *  as LeadStatusBadge's "client" — same underlying fact (this person is
 *  now a real client), same color language. */
const LABELS: Record<ContactRequest["status"], string> = {
  new: "Nueva",
  contacted: "Contactada",
  converted: "Convertida",
};

const COLORS: Record<ContactRequest["status"], { fg: string; bg: string; border: string }> = {
  new: { fg: "#c9a8ff", bg: "rgba(145,82,255,0.12)", border: "rgba(145,82,255,0.35)" },
  contacted: { fg: "#ff9f4a", bg: "rgba(255,159,74,0.12)", border: "rgba(255,159,74,0.35)" },
  converted: { fg: "#35d399", bg: "rgba(53,211,153,0.12)", border: "rgba(53,211,153,0.35)" },
};

export function ContactRequestStatusBadge({ status }: { status: ContactRequest["status"] }) {
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
