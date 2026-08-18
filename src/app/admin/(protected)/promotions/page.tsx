import Link from "next/link";
import { Plus, Tag } from "lucide-react";
import { listPromotions } from "@/lib/db/promotionStore";
import { getEffectivePromotionStatus } from "@/lib/promotions/effectiveStatus";
import { formatPromotionDiscount } from "@/lib/promotions/format";
import { PromotionStatusBadge } from "@/components/admin/PromotionStatusBadge";
import { PromotionActionButton } from "@/components/admin/PromotionActions";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEntityCard } from "@/components/admin/ui/AdminEntityCard";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { Button } from "@/components/ui/Button";
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
      <AdminPageHeader
        eyebrow="Comercial"
        title="Promociones"
        description="Administra las campañas promocionales de XAYVEN."
        action={
          <Button href="/admin/promotions/new" variant="secondary" size="md">
            <Plus className="size-4" aria-hidden="true" />
            Nueva promoción
          </Button>
        }
      />

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
          <AdminEmptyState icon={Tag} title="No hay promociones en esta categoría todavía." />
        )}
        {filtered.map(({ promotion, effectiveStatus }) => (
          <AdminEntityCard
            key={promotion.id}
            href={`/admin/promotions/${promotion.id}`}
            title={promotion.name}
            badge={<PromotionStatusBadge status={effectiveStatus} />}
            meta={
              <>
                {DATE_FORMAT.format(new Date(promotion.startAt))} – {DATE_FORMAT.format(new Date(promotion.endAt))}
              </>
            }
            highlight={formatPromotionDiscount(promotion)}
            description={
              <>
                <span className="line-clamp-2">{promotion.text}</span>
                <span className="mt-2 block text-xs text-fg-subtle">CTA: {promotion.ctaLabel}</span>
              </>
            }
            footer={
              <>
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
              </>
            }
          />
        ))}
      </div>
    </div>
  );
}
