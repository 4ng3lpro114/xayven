import type { PaymentStatus } from "@/lib/payments/types";

const COLORS: Record<PaymentStatus, { fg: string; bg: string; border: string }> = {
  PENDING: { fg: "#a9a3b8", bg: "rgba(169,163,184,0.12)", border: "rgba(169,163,184,0.3)" },
  APPROVED: { fg: "#35d399", bg: "rgba(53,211,153,0.12)", border: "rgba(53,211,153,0.35)" },
  DECLINED: { fg: "#ff5c72", bg: "rgba(255,92,114,0.12)", border: "rgba(255,92,114,0.35)" },
  ERROR: { fg: "#ff9f4a", bg: "rgba(255,159,74,0.12)", border: "rgba(255,159,74,0.35)" },
  VOIDED: { fg: "#a9a3b8", bg: "rgba(169,163,184,0.12)", border: "rgba(169,163,184,0.3)" },
  REFUNDED: { fg: "#4ac2ff", bg: "rgba(74,194,255,0.12)", border: "rgba(74,194,255,0.35)" },
};

/** Provider-agnostic status pill — used in both the client portal (i18n
 *  label passed in) and /admin/payments (Spanish label passed in). */
export function PaymentStatusBadge({ status, label }: { status: PaymentStatus; label: string }) {
  const color = COLORS[status];
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-medium"
      style={{ color: color.fg, background: color.bg, border: `1px solid ${color.border}` }}
    >
      {label}
    </span>
  );
}
