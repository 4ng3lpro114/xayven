import { AlertTriangle } from "lucide-react";
import type { DurationStats } from "@/lib/statistics/conversionVelocity";

function formatHours(hours: number): string {
  if (hours < 24) return `${Math.round(hours)} h`;
  const days = hours / 24;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)} d`;
}

/**
 * Fase 10 — one card per transition (exploring→interested, interested→hot,
 * hot→client, tiempo total). `stats.isRepresentative` gates whether the
 * median/average are presented as meaningful — with fewer than
 * MIN_SAMPLE_SIZE_FOR_VELOCITY_STATS (see conversionVelocity.ts) real
 * transitions, the numbers are still shown (never hidden) but explicitly
 * flagged as not representative yet, per the user's own instruction.
 */
export function ConversionVelocityCard({ label, stats }: { label: string; stats: DurationStats }) {
  return (
    <div className="rounded-lg border border-border bg-bg-raised p-5">
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">{label}</p>

      {stats.sampleSize === 0 ? (
        <p className="mt-3 text-sm text-fg-subtle">Sin transiciones registradas todavía.</p>
      ) : (
        <>
          <p className="mt-2 text-2xl font-semibold text-fg">
            {stats.medianHours !== null ? formatHours(stats.medianHours) : "—"}
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            mediana · promedio {stats.averageHours !== null ? formatHours(stats.averageHours) : "—"}
          </p>

          {stats.isRepresentative ? (
            stats.p25Hours !== null && stats.p75Hours !== null ? (
              <p className="mt-2 text-xs text-fg-subtle">
                Rango típico: {formatHours(stats.p25Hours)} – {formatHours(stats.p75Hours)} (
                {stats.sampleSize} {stats.sampleSize === 1 ? "caso" : "casos"})
              </p>
            ) : null
          ) : (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-fg-muted">
              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-fg-subtle" aria-hidden="true" />
              Muestra pequeña ({stats.sampleSize} {stats.sampleSize === 1 ? "caso" : "casos"}) — todavía
              no representativa.
            </p>
          )}
        </>
      )}
    </div>
  );
}
