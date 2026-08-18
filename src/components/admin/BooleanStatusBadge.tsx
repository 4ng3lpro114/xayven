/**
 * Admin Phase 5 — shared 2-state badge, same color-dot-+-label pattern as
 * PromotionStatusBadge/LeadStatusBadge. Reused by both Packages
 * (isActive) and Services (isPublished) instead of two near-identical
 * copies — the only thing that differs between them is the labels.
 */
const ACTIVE_COLOR = { fg: "#35d399", bg: "rgba(53,211,153,0.12)", border: "rgba(53,211,153,0.35)" };
const INACTIVE_COLOR = { fg: "#726c82", bg: "rgba(114,108,130,0.12)", border: "rgba(114,108,130,0.3)" };

export function BooleanStatusBadge({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  const color = active ? ACTIVE_COLOR : INACTIVE_COLOR;
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-medium"
      style={{ color: color.fg, background: color.bg, border: `1px solid ${color.border}` }}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}
