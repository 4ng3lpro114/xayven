import Link from "next/link";
import { Plus } from "lucide-react";
import { listPromotions } from "@/lib/db/promotionStore";
import { getEffectivePromotionStatus } from "@/lib/promotions/effectiveStatus";
import { formatPromotionDiscount } from "@/lib/promotions/format";
import { PromotionStatusBadge } from "@/components/admin/PromotionStatusBadge";
import { PromotionActionButton } from "@/components/admin/PromotionActions";
import { cn } from "@/lib/utils";
import type { PromotionEffectiveStatus } from "@/lib/promotions/types";

export const dynamic = "force-dynamic";

/**
 * Fase 11B — /admin/promotions. Same bulk-fetch + in-memory reduce pattern
 * as /admin/clients (also its exact `?filter=` server-rendered-Link pill
 * mechanism — no client JS needed to switch tabs, same as every other
 * filtered list in this panel).
 */
const AGGREGATION_LIMIT = 1000;

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "active", label: "Activas" },
  { key: "scheduled", label: "Programadas" },
  { key: "paused", label: "Pausadas" },
  { key: "expired", label: "Finalizadas" },
  { key: "archived", label: "Archivadas" },
];

function matchesFilter(filterKey: string, effectiveStatus: PromotionEffectiveStatus): boolean {
  if (filterKey === "all") return true;
  return filterKey === effectiveStatus;
}

function buildFilterHref(filterKey: string): string {
  return filterKey === "all" ? "/admin/promotions" : `/admin/promotions?filter=${filterKey}`;
}

const DATE_FORMAT = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" });

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function AdminPromotionsPage({ searchParams }: PageProps) {
  const { filter = "all" } = await searchParams;
  const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0]!;

  const promotions = await listPromotions({ limit: AGGREGATION_LIMIT });
  const now = new Date();

  const withStatus = promotions.map((p) => ({
    promotion: p,
    effectiveStatus: getEffectivePromotionStatus(p, now),
  }));

  const filtered = withStatus.filter((p) => matchesFilter(activeFilter.key, p.effectiveStatus));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-fg">Promociones</h1>
          <p className="mt-1 text-sm text-fg-muted">Administra las campañas promocionales de XAYVEN.</p>
        </div>
        <Link
          href="/admin/promotions/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-400"
        >
          <Plus className="size-4" aria-hidden="true" />
          Nueva promoción
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={buildFilterHref(f.key)}
            className={cn(
              "rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors",
              activeFilter.key === f.key
                ? "border-border-accent bg-bg-elevated text-fg"
                : "border-border-strong text-fg-muted hover:text-fg"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-fg-subtle">
            No hay promociones en esta categoría todavía.
          </p>
        )}
        {filtered.map(({ promotion, effectiveStatus }) => (
          <div key={promotion.id} className="rounded-lg border border-border bg-bg-raised p-5">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/admin/promotions/${promotion.id}`}
                className="text-sm font-semibold text-fg hover:text-accent-300"
              >
                {promotion.name}
              </Link>
              <PromotionStatusBadge status={effectiveStatus} />
            </div>

            <p className="mt-2 line-clamp-2 text-sm text-fg-muted">{promotion.text}</p>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
              <span className="font-mono text-accent-300">{formatPromotionDiscount(promotion)}</span>
              <span>·</span>
              <span>
                {DATE_FORMAT.format(new Date(promotion.startAt))} – {DATE_FORMAT.format(new Date(promotion.endAt))}
              </span>
            </div>

            <p className="mt-2 text-xs text-fg-subtle">CTA: {promotion.ctaLabel}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/admin/promotions/${promotion.id}`}
                className="inline-flex items-center rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-border-accent hover:text-fg"
              >
                Editar
              </Link>
              {promotion.status === "draft" && (
                <PromotionActionButton promotionId={promotion.id} action="schedule" />
              )}
              {promotion.status === "scheduled" && (
                <PromotionActionButton promotionId={promotion.id} action="pause" />
              )}
              {promotion.status === "paused" && (
                <PromotionActionButton promotionId={promotion.id} action="resume" />
              )}
              {promotion.status !== "archived" && (
                <PromotionActionButton promotionId={promotion.id} action="archive" variant="danger" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
