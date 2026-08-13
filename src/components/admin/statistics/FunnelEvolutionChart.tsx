import { History } from "lucide-react";
import type { FunnelEvolutionSeries } from "@/lib/statistics/types";
import { MiniBarSeriesChart } from "@/components/admin/statistics/MiniBarSeriesChart";

/**
 * lead_status_history empezó a registrar el 12-ago-2026, sin backfill —
 * `hasData: false` es el estado esperado y normal por un buen tiempo, no un
 * error. El texto de vacío es exactamente el pedido explícitamente por el
 * usuario, palabra por palabra.
 */
export function FunnelEvolutionChart({ evolution }: { evolution: FunnelEvolutionSeries }) {
  if (!evolution.hasData) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-border bg-bg-raised p-8 text-center">
        <History className="size-6 text-fg-subtle" aria-hidden="true" />
        <p className="mt-3 max-w-sm text-sm text-fg-muted">
          El historial de transiciones empezará a aparecer a medida que se registren nuevas
          interacciones.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-raised p-5 sm:p-6">
      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <span className="inline-block size-2 rounded-sm bg-accent-300" aria-hidden="true" />
            Llegaron a interesado
          </div>
          <div className="mt-2">
            <MiniBarSeriesChart
              points={evolution.reachedInterested}
              color="var(--color-accent-300)"
              emptyLabel="Sin transiciones en este período"
              unitLabelSingular="transición"
              unitLabelPlural="transiciones"
            />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <span className="inline-block size-2 rounded-sm" style={{ background: "#ff9f4a" }} aria-hidden="true" />
            Llegaron a caliente
          </div>
          <div className="mt-2">
            <MiniBarSeriesChart
              points={evolution.reachedHot}
              color="#ff9f4a"
              emptyLabel="Sin transiciones en este período"
              unitLabelSingular="transición"
              unitLabelPlural="transiciones"
            />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <span className="inline-block size-2 rounded-sm bg-success" aria-hidden="true" />
            Se convirtieron en cliente
          </div>
          <div className="mt-2">
            <MiniBarSeriesChart
              points={evolution.reachedClient}
              color="var(--color-success)"
              emptyLabel="Sin transiciones en este período"
              unitLabelSingular="transición"
              unitLabelPlural="transiciones"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
