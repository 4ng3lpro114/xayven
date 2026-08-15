/**
 * Same exact visual pattern as LeadStatusBadge/ClientImportanceBadge (pill,
 * inline rgba colors) — not a new badge system. Used ONLY on the client
 * detail page's "Cuenta XAYVEN" label+value row (0012_clients_is_commercial.sql
 * UX pass) — distinct from AccountBadge, which bakes the "Cuenta XAYVEN"
 * text into the pill itself for the list page's compact column (no room
 * for a separate label there). Here the label is already rendered
 * alongside this badge, so the pill only needs to say the value
 * ("Activa"/"Inactiva"), never repeat "Cuenta XAYVEN" — avoids the
 * redundant "Cuenta XAYVEN: Cuenta XAYVEN" that reusing AccountBadge here
 * would produce.
 *
 * Purple ("Activa") reused verbatim from AccountBadge/LeadStatusBadge's
 * "interested" tone — same meaning, a real linked account. Gray
 * ("Inactiva") matches every other neutral/absent state in this codebase
 * (LeadStatusBadge's "exploring", ClientImportanceBadge's "normal").
 */
const COLORS = {
  active: { fg: "#c9a8ff", bg: "rgba(145,82,255,0.12)", border: "rgba(145,82,255,0.35)" },
  inactive: { fg: "#a9a3b8", bg: "rgba(169,163,184,0.12)", border: "rgba(169,163,184,0.3)" },
};

export function AccountStatusBadge({ active }: { active: boolean }) {
  const color = active ? COLORS.active : COLORS.inactive;
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-medium"
      style={{ color: color.fg, background: color.bg, border: `1px solid ${color.border}` }}
    >
      {active ? "Activa" : "Inactiva"}
    </span>
  );
}
