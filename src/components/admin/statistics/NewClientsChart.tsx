import { Users } from "lucide-react";
import type { TimeSeriesPoint } from "@/lib/statistics/types";

/**
 * Secondary chart — deliberately a different chart type (bars, not a
 * line) from RevenueChart so the two are never visually confused, per
 * Fase 7B rule 13. Represents "clientes NUEVOS creados" (clients.created_at)
 * — never framed as "clientes activos" or any other historical claim (see
 * buildNewClientsSeries in aggregate.ts).
 *
 * No client-side JS needed: hover feedback uses a native <title> element
 * per bar, so this renders fully on the server like the rest of the page.
 */
const VIEW_W = 1000;
const VIEW_H = 180;
const PADDING = { top: 12, right: 12, bottom: 28, left: 12 };
const PLOT_W = VIEW_W - PADDING.left - PADDING.right;
const PLOT_H = VIEW_H - PADDING.top - PADDING.bottom;
const MAX_X_LABELS = 8;

export function NewClientsChart({
  points,
  periodLabel,
}: {
  points: TimeSeriesPoint[];
  periodLabel: string;
}) {
  const total = points.reduce((sum, p) => sum + p.value, 0);

  if (points.length === 0 || total === 0) {
    const periodPhrase = periodLabel === "Todo" ? "en todo el tiempo" : `en ${periodLabel.toLowerCase()}`;
    return (
      <div className="flex min-h-[160px] flex-col items-center justify-center rounded-lg border border-border bg-bg-raised p-6 text-center">
        <Users className="size-5 text-fg-subtle" aria-hidden="true" />
        <p className="mt-2 text-sm text-fg-muted">Sin clientes nuevos {periodPhrase}</p>
      </div>
    );
  }

  const maxValue = Math.max(...points.map((p) => p.value));
  const barWidth = (PLOT_W / points.length) * 0.6;
  const gap = (PLOT_W / points.length) * 0.4;
  const labelStride = Math.max(1, Math.ceil(points.length / MAX_X_LABELS));
  const periodPhrase = periodLabel === "Todo" ? "todo el tiempo" : periodLabel.toLowerCase();

  return (
    <div className="rounded-lg border border-border bg-bg-raised p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <span className="inline-block size-2.5 rounded-sm bg-accent-300" aria-hidden="true" />
          Clientes nuevos creados
        </div>
        <span className="text-xs text-fg-subtle">{periodLabel}</span>
      </div>

      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="mt-3 w-full" role="img" aria-label="Clientes nuevos por período">
        {points.map((p, i) => {
          const x = PADDING.left + i * (barWidth + gap) + gap / 2;
          const h = maxValue === 0 ? 0 : (p.value / maxValue) * PLOT_H;
          const y = PADDING.top + PLOT_H - h;
          return (
            <g key={p.date}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(h, p.value > 0 ? 3 : 0)}
                rx={2}
                fill="var(--color-accent-300)"
                opacity={p.value > 0 ? 0.85 : 0.15}
              >
                <title>{`${p.label}: ${p.value} ${p.value === 1 ? "cliente nuevo" : "clientes nuevos"}`}</title>
              </rect>
              {i % labelStride === 0 || i === points.length - 1 ? (
                <text
                  x={x + barWidth / 2}
                  y={VIEW_H - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--color-fg-subtle)"
                >
                  {p.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <p className="mt-2 text-xs text-fg-subtle">{total} en total durante {periodPhrase}</p>
    </div>
  );
}
