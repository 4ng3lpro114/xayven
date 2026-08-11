import type { LeadStatus } from "@/lib/db/types";

const LABELS: Record<LeadStatus, string> = {
  exploring: "Explorando",
  interested: "Interesado",
  hot: "Caliente",
  client: "Cliente",
  support: "Soporte",
};

const COLORS: Record<LeadStatus, { fg: string; bg: string; border: string }> = {
  exploring: { fg: "#a9a3b8", bg: "rgba(169,163,184,0.12)", border: "rgba(169,163,184,0.3)" },
  interested: { fg: "#c9a8ff", bg: "rgba(145,82,255,0.12)", border: "rgba(145,82,255,0.35)" },
  hot: { fg: "#ff9f4a", bg: "rgba(255,159,74,0.12)", border: "rgba(255,159,74,0.35)" },
  client: { fg: "#35d399", bg: "rgba(53,211,153,0.12)", border: "rgba(53,211,153,0.35)" },
  support: { fg: "#4ac2ff", bg: "rgba(74,194,255,0.12)", border: "rgba(74,194,255,0.35)" },
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
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
