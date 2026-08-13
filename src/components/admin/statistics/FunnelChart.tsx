import type { FunnelSnapshot, FunnelStageKey } from "@/lib/statistics/types";

/**
 * `lead_status` is a CURRENT state, not a progress log — see the doc
 * comment on buildFunnelSnapshot() in aggregate.ts for why each stage here
 * is "reach" (currently at this stage or further), not a raw per-status
 * count. Rendered as CSS width bars (no SVG needed for this shape) — matches
 * XAYVEN's existing hand-rolled-chart rule without adding one more SVG
 * component where a simpler one suffices.
 *
 * Fase 10 (opción 3 aprobada): cada etapa muestra DOS números, cada uno con
 * su propia etiqueta explícita, nunca ambiguos entre sí —
 *   - el número grande, "acumulado" — dirige el ancho de la barra, conserva
 *     la forma decreciente del embudo (stage.count — ver aggregate.ts).
 *   - la línea pequeña bajo la barra, "exactamente en esta etapa" —
 *     stage.exactCount, la MISMA cifra cruda que ya muestra la pestaña
 *     Leads ("Por estado"), nunca una definición distinta.
 * Para "Conversaciones" y "Cliente" ambos números siempre coinciden (por
 * construcción, ver aggregate.ts) — se muestran igual, tal como se pidió,
 * simplemente sin aportar información nueva ahí.
 */
const STAGE_COLORS: Record<FunnelStageKey, string> = {
  conversations: "var(--color-fg-subtle)",
  exploring: "#a9a3b8",
  interested: "#c9a8ff",
  hot: "#ff9f4a",
  client: "#35d399",
};

export function FunnelChart({ snapshot }: { snapshot: FunnelSnapshot }) {
  const topCount = snapshot.stages[0]?.count ?? 0;

  if (topCount === 0) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-border bg-bg-raised p-8 text-center">
        <p className="text-sm text-fg-muted">Todavía no hay conversaciones para mostrar el embudo.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-raised p-5 sm:p-6">
      <div className="flex flex-col gap-5">
        {snapshot.stages.map((stage) => {
          const widthPct = topCount > 0 ? Math.max((stage.count / topCount) * 100, stage.count > 0 ? 3 : 0) : 0;
          return (
            <div key={stage.key}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-sm font-medium text-fg">{stage.label}</span>
                <span className="font-mono text-[0.65rem] text-fg-subtle">
                  {stage.pctOfTotal !== null && <>{stage.pctOfTotal}% del total</>}
                  {stage.pctOfPrevious !== null && <> · {stage.pctOfPrevious}% de la etapa anterior</>}
                </span>
              </div>

              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-semibold text-fg">{stage.count}</span>
                <span className="text-xs text-fg-subtle">acumulado</span>
              </div>

              <div className="mt-2 h-3 overflow-hidden rounded-pill bg-bg-elevated">
                <div
                  className="h-full rounded-pill transition-[width] duration-500"
                  style={{ width: `${widthPct}%`, background: STAGE_COLORS[stage.key] }}
                />
              </div>

              <p className="mt-1.5 font-mono text-[0.7rem] text-fg-subtle">
                {stage.exactCount} exactamente en esta etapa
              </p>
            </div>
          );
        })}
      </div>

      {snapshot.supportCount > 0 && (
        <p className="mt-4 text-xs text-fg-subtle">
          +{snapshot.supportCount} {snapshot.supportCount === 1 ? "conversación" : "conversaciones"} en
          soporte — fuera del embudo comercial, nunca se asume que hayan pasado por interesado/caliente.
        </p>
      )}
    </div>
  );
}
