/**
 * Same exact visual pattern as LeadStatusBadge/ClientImportanceBadge (pill,
 * inline rgba colors) — not a new badge system. The authoritative,
 * explicit "Cliente"/"Sin cliente" indicator on the client detail page's
 * "Cliente" label+value row (0012_clients_is_commercial.sql UX pass) —
 * direct passthrough of `clients.is_commercial` via
 * ClientSummary.isCommercialClient, never inferred.
 *
 * Colors reused verbatim: green ("Cliente") is the exact same tone
 * LeadStatusBadge already uses for its own "client" status — deliberately
 * consistent, not a second meaning for green. Gray ("Sin cliente") matches
 * every other neutral/absent state in this codebase.
 *
 * Because this badge already says "Cliente" whenever isCommercial is true,
 * the client detail page skips rendering LeadStatusBadge for
 * `leadStatus === "client"` right next to it (see
 * /admin/clients/[id]/page.tsx) — showing both would be the exact same
 * fact twice. LeadStatusBadge still renders normally for every other
 * status (interested/exploring/hot/support), which this badge does not
 * express.
 */
const COLORS = {
  client: { fg: "#35d399", bg: "rgba(53,211,153,0.12)", border: "rgba(53,211,153,0.35)" },
  none: { fg: "#a9a3b8", bg: "rgba(169,163,184,0.12)", border: "rgba(169,163,184,0.3)" },
};

export function CommercialStatusBadge({ isCommercial }: { isCommercial: boolean }) {
  const color = isCommercial ? COLORS.client : COLORS.none;
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-medium"
      style={{ color: color.fg, background: color.bg, border: `1px solid ${color.border}` }}
    >
      {isCommercial ? "Cliente" : "Sin cliente"}
    </span>
  );
}
