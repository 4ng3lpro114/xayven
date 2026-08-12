import type { ClientImportance } from "@/lib/clients/importance";

/**
 * Same exact visual pattern as LeadStatusBadge/PaymentStatusBadge (pill,
 * inline rgba colors) — not a new badge system. Colors are reused verbatim
 * from those two components: gray = neutral, orange = "pay attention"
 * (same tone as "hot"/lead ERROR), green = "protected" reads as a
 * positive signal here (a real, valuable client we're safeguarding from
 * accidental deletion), same tone already used for "client"/APPROVED.
 */
const LABELS: Record<ClientImportance, string> = {
  normal: "Normal",
  important: "Importante",
  protected: "Protegido",
};

const COLORS: Record<ClientImportance, { fg: string; bg: string; border: string }> = {
  normal: { fg: "#a9a3b8", bg: "rgba(169,163,184,0.12)", border: "rgba(169,163,184,0.3)" },
  important: { fg: "#ff9f4a", bg: "rgba(255,159,74,0.12)", border: "rgba(255,159,74,0.35)" },
  protected: { fg: "#35d399", bg: "rgba(53,211,153,0.12)", border: "rgba(53,211,153,0.35)" },
};

export function ClientImportanceBadge({ importance }: { importance: ClientImportance }) {
  const color = COLORS[importance];
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-medium"
      style={{ color: color.fg, background: color.bg, border: `1px solid ${color.border}` }}
    >
      {LABELS[importance]}
    </span>
  );
}
