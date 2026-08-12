import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Same tile pattern already used at /admin (dashboard) and
 * /admin/clients/[id] (rounded-lg border border-border bg-bg-raised) —
 * not a new visual system, just made reusable across Estadísticas'
 * several sections instead of repeating the markup in each one.
 */
export function StatCard({
  label,
  value,
  caption,
  trendPct,
  accent = false,
  muted = false,
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  /** null/undefined → no trend shown (never fabricate a percentage over a
   *  zero or missing baseline — see src/lib/statistics/aggregate.ts). */
  trendPct?: number | null;
  /** Subtle accent border for the single most important card in a
   *  section — used sparingly, never as a flood fill. */
  accent?: boolean;
  /** Visually de-emphasizes the value (muted color instead of full
   *  foreground) — used for "Cancelados" in Trabajos so it never reads
   *  with the same weight as the 3 real work stages next to it, even
   *  though the 4 cards share the same size/shape (Fase 7B revisión
   *  final). */
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-bg-raised p-5",
        accent ? "border-border-accent" : "border-border"
      )}
    >
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold", muted ? "text-fg-subtle" : "text-fg")}>{value}</p>
      {(caption || trendPct !== undefined) && (
        <div className="mt-1.5 flex items-center gap-2">
          {caption && <p className="text-xs text-fg-muted">{caption}</p>}
          {trendPct !== undefined && trendPct !== null && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium",
                trendPct >= 0 ? "text-success" : "text-error"
              )}
            >
              {trendPct >= 0 ? (
                <TrendingUp className="size-3" aria-hidden="true" />
              ) : (
                <TrendingDown className="size-3" aria-hidden="true" />
              )}
              {trendPct >= 0 ? "+" : ""}
              {trendPct}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}
