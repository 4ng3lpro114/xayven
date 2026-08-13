import type { TimeSeriesPoint } from "@/lib/statistics/types";

/**
 * Fase 10 — generalizes NewClientsChart.tsx's bar-chart pattern (hand-rolled
 * SVG, native <title> for hover, no client JS) into a reusable component
 * for the several new series this phase adds (leads/proyectos/conversiones
 * a lo largo del tiempo, evolución del funnel). NewClientsChart itself is
 * left untouched — this is a sibling, not a replacement, so the existing,
 * already-tested "Nuevos clientes" chart keeps working exactly as before.
 */
const VIEW_W = 1000;
const PADDING = { top: 8, right: 8, bottom: 22, left: 8 };
const MAX_X_LABELS = 8;

export function MiniBarSeriesChart({
  points,
  color = "var(--color-accent-300)",
  emptyLabel,
  unitLabelSingular,
  unitLabelPlural,
  height = 120,
}: {
  points: TimeSeriesPoint[];
  color?: string;
  emptyLabel: string;
  unitLabelSingular: string;
  unitLabelPlural: string;
  height?: number;
}) {
  const total = points.reduce((sum, p) => sum + p.value, 0);

  if (points.length === 0 || total === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-border bg-bg-elevated px-4 text-center"
        style={{ minHeight: height }}
      >
        <p className="text-xs text-fg-subtle">{emptyLabel}</p>
      </div>
    );
  }

  const plotW = VIEW_W - PADDING.left - PADDING.right;
  const plotH = height - PADDING.top - PADDING.bottom;
  const maxValue = Math.max(...points.map((p) => p.value));
  const barWidth = (plotW / points.length) * 0.6;
  const gap = (plotW / points.length) * 0.4;
  const labelStride = Math.max(1, Math.ceil(points.length / MAX_X_LABELS));

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${height}`}
      className="w-full"
      role="img"
      aria-label={`${total} ${total === 1 ? unitLabelSingular : unitLabelPlural}`}
    >
      {points.map((p, i) => {
        const x = PADDING.left + i * (barWidth + gap) + gap / 2;
        const h = maxValue === 0 ? 0 : (p.value / maxValue) * plotH;
        const y = PADDING.top + plotH - h;
        return (
          <g key={p.date}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(h, p.value > 0 ? 3 : 0)}
              rx={2}
              fill={color}
              opacity={p.value > 0 ? 0.85 : 0.15}
            >
              <title>{`${p.label}: ${p.value} ${p.value === 1 ? unitLabelSingular : unitLabelPlural}`}</title>
            </rect>
            {i % labelStride === 0 || i === points.length - 1 ? (
              <text
                x={x + barWidth / 2}
                y={height - 6}
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
  );
}
