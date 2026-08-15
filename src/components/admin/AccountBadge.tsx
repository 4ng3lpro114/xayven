/**
 * Same visual pattern as LeadStatusBadge/ClientImportanceBadge (pill,
 * inline rgba colors) — not a new badge system. Purple tone reused
 * verbatim from LeadStatusBadge's "interested" — XAYVEN's own accent
 * color (#9152ff family) — since a linked account signals the same kind
 * of thing: someone who has taken a concrete, real step (creating an
 * XAYVEN account), not a status we're inferring.
 *
 * Deliberately a single fixed badge (no variants/labels record like the
 * other badges) — "has an account" is a plain boolean, not an enum. The
 * "no account" case renders "—" directly in the table, matching the
 * existing convention already used for empty Estado/Última actividad
 * cells — no separate component needed for that half.
 */
export function AccountBadge() {
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-medium"
      style={{
        color: "#c9a8ff",
        background: "rgba(145,82,255,0.12)",
        border: "1px solid rgba(145,82,255,0.35)",
      }}
    >
      Cuenta XAYVEN
    </span>
  );
}
