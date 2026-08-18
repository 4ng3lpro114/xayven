import type { ProjectStatus } from "@/lib/payments/types";

/**
 * Admin UI Polish — Phase 2. Same color-dot-+-label pill pattern as
 * PaymentStatusBadge/ContactRequestStatusBadge/PromotionStatusBadge — no
 * new visual system, no new colors. Presentation-only: translates the 9
 * real ProjectStatus values (src/lib/payments/types.ts, 0002_payments.sql)
 * to a human label. Deliberately NOT the 4-bucket grouping
 * lib/statistics/projectStages.ts uses for reporting — an admin looking at
 * one specific project needs its real, distinct status (e.g. "proposal"
 * vs. "awaiting_payment" matters here, even though both collapse to
 * "pending" for aggregate stats). Never touches ProjectStatus itself, the
 * transition logic in ProjectActions.tsx, or any API/DB value.
 */
const LABELS: Record<ProjectStatus, string> = {
  lead: "Lead",
  proposal: "Propuesta enviada",
  awaiting_payment: "Esperando pago",
  active: "Activo",
  in_progress: "En progreso",
  review: "En revisión",
  completed: "Completado",
  maintenance: "Mantenimiento",
  cancelled: "Cancelado",
};

const COLORS: Record<ProjectStatus, { fg: string; bg: string; border: string }> = {
  lead: { fg: "#a9a3b8", bg: "rgba(169,163,184,0.12)", border: "rgba(169,163,184,0.3)" },
  proposal: { fg: "#c9a8ff", bg: "rgba(145,82,255,0.12)", border: "rgba(145,82,255,0.35)" },
  awaiting_payment: { fg: "#ff9f4a", bg: "rgba(255,159,74,0.12)", border: "rgba(255,159,74,0.35)" },
  active: { fg: "#4ac2ff", bg: "rgba(74,194,255,0.12)", border: "rgba(74,194,255,0.35)" },
  in_progress: { fg: "#4ac2ff", bg: "rgba(74,194,255,0.12)", border: "rgba(74,194,255,0.35)" },
  review: { fg: "#4ac2ff", bg: "rgba(74,194,255,0.12)", border: "rgba(74,194,255,0.35)" },
  completed: { fg: "#35d399", bg: "rgba(53,211,153,0.12)", border: "rgba(53,211,153,0.35)" },
  maintenance: { fg: "#c9a8ff", bg: "rgba(145,82,255,0.12)", border: "rgba(145,82,255,0.35)" },
  cancelled: { fg: "#ff5c72", bg: "rgba(255,92,114,0.12)", border: "rgba(255,92,114,0.35)" },
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
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
