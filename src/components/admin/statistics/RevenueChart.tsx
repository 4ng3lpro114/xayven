"use client";

import { useId, useState } from "react";
import { TrendingUp } from "lucide-react";
import { formatMoney } from "@/lib/payments/format";
import type { TimeSeriesPoint } from "@/lib/statistics/types";

/**
 * The centerpiece chart of /admin/statistics — hand-rolled SVG, no
 * charting library added (none was installed, and this project's own
 * rule is to reuse what exists before adding a dependency — see Fase 7A
 * audit §12/Fase 7B rules). Colors/typography come exclusively from the
 * existing design tokens in globals.css (--color-accent-*, --color-bg-*,
 * --color-border, --color-fg-*) — nothing new introduced.
 *
 * `currency === null` means there were zero APPROVED payments in the
 * selected period (see buildRevenueSeries in aggregate.ts) — rendered as
 * an explicit empty state, never a flat line at 0 pretending there was
 * activity.
 */

const VIEW_W = 1000;
const VIEW_H = 340;
const PADDING = { top: 20, right: 20, bottom: 36, left: 72 };
const PLOT_W = VIEW_W - PADDING.left - PADDING.right;
const PLOT_H = VIEW_H - PADDING.top - PADDING.bottom;
const MAX_X_LABELS = 7;

function compactAmount(amount: number): string {
  return new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 }).format(
    amount
  );
}

function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

export function RevenueChart({
  points,
  currency,
  otherCurrenciesExcluded,
  periodLabel,
}: {
  points: TimeSeriesPoint[];
  currency: string | null;
  otherCurrenciesExcluded: string[];
  periodLabel: string;
}) {
  const gradientId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  if (currency === null || points.length === 0) {
    const periodPhrase = periodLabel === "Todo" ? "en todo el tiempo" : `en ${periodLabel.toLowerCase()}`;
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-border bg-bg-raised p-8 text-center">
        <TrendingUp className="size-6 text-fg-subtle" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-fg">Sin ingresos registrados {periodPhrase}</p>
        <p className="mt-1 max-w-sm text-xs text-fg-subtle">
          Esta gráfica solo cuenta pagos con estado aprobado. En cuanto haya uno en este período,
          aparecerá aquí.
        </p>
      </div>
    );
  }

  const maxValue = Math.max(...points.map((p) => p.value));
  const yMax = maxValue === 0 ? 1 : maxValue * 1.15;

  const xFor = (i: number) =>
    PADDING.left + (points.length === 1 ? PLOT_W / 2 : (i / (points.length - 1)) * PLOT_W);
  const yFor = (v: number) => PADDING.top + PLOT_H - (v / yMax) * PLOT_H;

  const coords = points.map((p, i) => ({ x: xFor(i), y: yFor(p.value) }));
  const linePath = buildSmoothPath(coords);
  const baselineY = PADDING.top + PLOT_H;
  const areaPath = `${linePath} L ${coords[coords.length - 1]!.x} ${baselineY} L ${coords[0]!.x} ${baselineY} Z`;

  const gridLines = [0, 0.5, 1];
  const labelStride = Math.max(1, Math.ceil(points.length / MAX_X_LABELS));

  const hoveredPoint = hovered !== null ? points[hovered] : null;
  const hoveredCoord = hovered !== null ? coords[hovered] : null;

  return (
    <div className="rounded-lg border border-border bg-bg-raised p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <span className="inline-block size-2.5 rounded-full bg-accent-400" aria-hidden="true" />
          Ingresos recibidos ({currency})
        </div>
        <span className="text-xs text-fg-subtle">{periodLabel}</span>
      </div>

      <div className="relative mt-4">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full"
          role="img"
          aria-label={`Evolución de ingresos aprobados en ${currency}, ${periodLabel.toLowerCase()}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent-500)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--color-accent-500)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid muy sutil — solo 3 líneas horizontales de referencia */}
          {gridLines.map((fraction) => {
            const y = PADDING.top + PLOT_H * (1 - fraction);
            return (
              <line
                key={fraction}
                x1={PADDING.left}
                x2={VIEW_W - PADDING.right}
                y1={y}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
            );
          })}

          {/* Eje Y — 3 valores discretos */}
          {gridLines.map((fraction) => {
            const y = PADDING.top + PLOT_H * (1 - fraction);
            return (
              <text
                key={fraction}
                x={PADDING.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--color-fg-subtle)"
              >
                {compactAmount(yMax * fraction)}
              </text>
            );
          })}

          {/* Eje X — etiquetas espaciadas para no saturar */}
          {points.map((p, i) =>
            i % labelStride === 0 || i === points.length - 1 ? (
              <text
                key={p.date}
                x={xFor(i)}
                y={VIEW_H - 10}
                textAnchor="middle"
                fontSize={11}
                fill="var(--color-fg-subtle)"
              >
                {p.label}
              </text>
            ) : null
          )}

          <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
          <path
            d={linePath}
            fill="none"
            stroke="var(--color-accent-400)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {coords.map((c, i) => (
            <g key={points[i]!.date}>
              {/* Área de interacción ampliada — invisible, más fácil de acertar con el mouse */}
              <circle
                cx={c.x}
                cy={c.y}
                r={16}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${points[i]!.label}: ${formatMoney(points[i]!.value, currency)}`}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered((h) => (h === i ? null : h))}
              />
              <circle
                cx={c.x}
                cy={c.y}
                r={hovered === i ? 5 : 3}
                fill="var(--color-bg-raised)"
                stroke="var(--color-accent-400)"
                strokeWidth={2}
                className="pointer-events-none transition-[r] duration-150"
              />
            </g>
          ))}

          {hoveredCoord && (
            <line
              x1={hoveredCoord.x}
              x2={hoveredCoord.x}
              y1={PADDING.top}
              y2={baselineY}
              stroke="var(--color-border-accent)"
              strokeWidth={1}
              className="pointer-events-none"
            />
          )}
        </svg>

        {hoveredPoint && hoveredCoord && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-md border border-border-strong bg-bg-overlay px-3 py-2 text-xs shadow-elevated"
            style={{ left: `${(hoveredCoord.x / VIEW_W) * 100}%`, top: `${(hoveredCoord.y / VIEW_H) * 100}%` }}
          >
            <p className="text-fg-subtle">{hoveredPoint.label}</p>
            <p className="mt-0.5 font-semibold text-fg">{formatMoney(hoveredPoint.value, currency)}</p>
          </div>
        )}
      </div>

      {otherCurrenciesExcluded.length > 0 && (
        <p className="mt-3 text-xs text-fg-subtle">
          También hubo pagos aprobados en {otherCurrenciesExcluded.join(", ")} en este período, no
          incluidos en esta gráfica para no mezclar monedas distintas.
        </p>
      )}
    </div>
  );
}
