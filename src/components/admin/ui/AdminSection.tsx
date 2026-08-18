import type { ReactNode } from "react";
import { AdminCard } from "@/components/admin/ui/AdminCard";

/**
 * Admin UI Polish — a titled, card-wrapped block of a detail page (e.g.
 * "Datos del mercado", "Países enrutados", "Precios oficiales" on
 * /admin/markets/[id]). Replaces the old flat `<section className="mt-10">
 * <h2 className="text-sm font-semibold">` pattern, which had no visual
 * separation between sections beyond a margin — the exact "everything
 * runs together" complaint this polish pass exists to fix. Pure layout;
 * never touches what each section actually renders.
 */
export function AdminSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** Optional action aligned with the title (e.g. a status toggle). */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-fg">{title}</h2>
          {description && <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p>}
        </div>
        {action}
      </div>
      <AdminCard className="mt-4">{children}</AdminCard>
    </section>
  );
}
