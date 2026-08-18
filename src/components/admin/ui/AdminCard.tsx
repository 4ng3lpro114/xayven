import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Admin UI Polish — the ONE elevated-surface shape for the Admin, used by
 * AdminSection/AdminEntityCard and directly wherever a standalone card is
 * needed. Slightly more premium than the old ad hoc `rounded-lg border
 * border-border bg-bg-raised` (bumped to rounded-xl + shadow-soft, the
 * same shadow token the public site already uses) — never a bespoke card
 * style invented per screen.
 */
export function AdminCard({
  children,
  className,
  padded = true,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  /** Set false when the content itself manages its own padding (e.g. a
   *  table that needs edge-to-edge rows). */
  padded?: boolean;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-bg-raised shadow-soft",
        padded && "p-6",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
