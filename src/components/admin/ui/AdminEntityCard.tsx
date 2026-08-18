import type { ReactNode } from "react";
import Link from "next/link";
import { AdminCard } from "@/components/admin/ui/AdminCard";

/**
 * Admin UI Polish — the ONE list-item card shape for every "grid of
 * entities" screen (Packages, Markets, Services today). Before this, each
 * of those three pages hand-rolled its own near-identical card (title +
 * badge + meta line + description + action row) with small, accumulating
 * drifts — exactly the "diferencias visuales entre distintas secciones"
 * the audit flagged. One shared component now, no logic inside it beyond
 * layout: every field (title, price, badge, actions) is still supplied by
 * the page/store data, nothing hardcoded or invented here.
 */
export function AdminEntityCard({
  href,
  title,
  badge,
  meta,
  highlight,
  description,
  footer,
}: {
  href: string;
  title: string;
  /** Status badge, top-right (e.g. BooleanStatusBadge). */
  badge?: ReactNode;
  /** Small mono uppercase line under the title — slug, code, category. */
  meta?: ReactNode;
  /** The one number/fact this entity is best known by — a price, a
   *  currency + fallback policy summary. Rendered larger, accent-colored. */
  highlight?: ReactNode;
  description?: ReactNode;
  /** Action row — edit link, activate/deactivate button, etc. */
  footer?: ReactNode;
}) {
  return (
    <AdminCard className="flex h-full flex-col transition-colors hover:border-border-accent">
      <div className="flex items-start justify-between gap-3">
        <Link href={href} className="text-sm font-semibold text-fg hover:text-accent-300">
          {title}
        </Link>
        {badge}
      </div>

      {meta && <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.1em] text-fg-subtle">{meta}</p>}

      {highlight && <p className="mt-3 text-lg font-semibold text-accent-300">{highlight}</p>}

      {description && <p className="mt-3 flex-1 text-sm text-fg-muted">{description}</p>}

      {footer && <div className="mt-4 flex flex-wrap gap-2 pt-1">{footer}</div>}
    </AdminCard>
  );
}
