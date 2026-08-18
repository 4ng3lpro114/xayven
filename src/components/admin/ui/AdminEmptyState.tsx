import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Admin UI Polish — the ONE "nothing here yet" shape, replacing bare
 * `<p className="col-span-full py-10 text-center text-sm text-fg-subtle">`
 * strings repeated per list page. An optional icon gives it real presence
 * instead of reading like a database returning zero rows.
 */
export function AdminEmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
}) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
      {Icon && <Icon className="size-6 text-fg-subtle" aria-hidden="true" />}
      <p className="text-sm font-medium text-fg-muted">{title}</p>
      {description && <p className="max-w-sm text-sm text-fg-subtle">{description}</p>}
    </div>
  );
}
