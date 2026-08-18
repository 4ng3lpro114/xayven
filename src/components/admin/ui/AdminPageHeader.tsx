import type { ReactNode } from "react";

/**
 * Admin UI Polish — the ONE header shape every Admin page uses from here
 * on, replacing the ad hoc `<div className="flex ... justify-between">
 * <h1 className="text-xl font-semibold">` repeated (with small drifting
 * differences) across packages/markets/services/etc. Purely presentational
 * — no data fetching, no behavior, just consistent hierarchy and spacing
 * so every section of the Admin reads as the same product.
 */
export function AdminPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  /** Small mono uppercase label above the title — same visual role as
   *  Badge variant="eyebrow" on the public site (e.g. "MERCADOS",
   *  "PRICING CORE"). Optional — omit for pages where it'd be redundant
   *  with the sidebar nav item already highlighted. */
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  /** Primary action for this page — a "Nuevo X" button, typically. */
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
      <div>
        {eyebrow && (
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-accent-300">{eyebrow}</p>
        )}
        <h1 className={`text-2xl font-semibold tracking-tight text-fg ${eyebrow ? "mt-1.5" : ""}`}>{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-fg-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-3">{action}</div>}
    </div>
  );
}
