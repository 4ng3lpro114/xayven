import { Plus, PackageSearch } from "lucide-react";
import { listPricingCatalogItems } from "@/lib/db/pricingCatalogStore";
import { formatMoney } from "@/lib/payments/format";
import { BooleanStatusBadge } from "@/components/admin/BooleanStatusBadge";
import { PackageActionButton } from "@/components/admin/PackageActions";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEntityCard } from "@/components/admin/ui/AdminEntityCard";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { PricingCategory } from "@/lib/pricing/types";

export const dynamic = "force-dynamic";

/**
 * Admin Phase 5 — /admin/packages. Same bulk-fetch + server-rendered
 * `?filter=` pill mechanism as /admin/promotions (no client JS needed to
 * switch tabs). Covers BOTH "Packages" and "Maintenance Plans" from the
 * master prompt's §12 — they're the same underlying pricing_catalog
 * table (category="package" vs. "maintenance"), so this is one admin
 * section with a category filter, never two duplicated CRUDs for what
 * is structurally the same entity.
 *
 * Admin UI Polish — restyled onto AdminPageHeader/AdminEntityCard (the
 * shared list-card, see its own doc comment for why). No data, no route,
 * no field changed — every price/name/slug still comes straight from
 * listPricingCatalogItems(), only how it's laid out changed.
 */
const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "package", label: "Paquetes web" },
  { key: "maintenance", label: "Mantenimiento" },
];

function buildFilterHref(filterKey: string): string {
  return filterKey === "all" ? "/admin/packages" : `/admin/packages?filter=${filterKey}`;
}

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function AdminPackagesPage({ searchParams }: PageProps) {
  const { filter = "all" } = await searchParams;
  const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0]!;

  const items = await listPricingCatalogItems(
    activeFilter.key === "all" ? undefined : { category: activeFilter.key as PricingCategory }
  );

  return (
    <div>
      <AdminPageHeader
        eyebrow="Pricing Core"
        title="Paquetes y mantenimiento"
        description="Fuente única de precios para Services y Maintenance — cada cambio aquí se refleja de inmediato en la web pública, en XAYVEN AI y en el resolver de International Pricing."
        action={
          <Button href="/admin/packages/new" size="md">
            <Plus className="size-4" aria-hidden="true" />
            Nuevo producto
          </Button>
        }
      />

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <a
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
          </a>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.length === 0 && (
          <AdminEmptyState
            icon={PackageSearch}
            title="No hay productos en esta categoría todavía"
            description="Crea el primero con “Nuevo producto” arriba."
          />
        )}
        {items.map((item) => {
          const featureCount = item.features.es.length;
          return (
            <AdminEntityCard
              key={item.id}
              href={`/admin/packages/${item.id}`}
              title={item.name}
              badge={<BooleanStatusBadge active={item.isActive} activeLabel="Activo" inactiveLabel="Inactivo" />}
              meta={`${item.category === "package" ? "Paquete web" : "Mantenimiento"} · ${item.slug}`}
              highlight={
                <>
                  {item.priceType === "FROM" ? "Desde " : ""}
                  {formatMoney(item.basePrice, item.currency)}
                  {item.billingInterval === "MONTHLY" ? "/mes" : ""}
                </>
              }
              description={
                item.billingInterval === "ONE_TIME" ? "Pago único" : featureCount > 0 ? `${featureCount} características` : undefined
              }
              footer={
                <>
                  <Button href={`/admin/packages/${item.id}`} variant="secondary" size="md" className="px-3 py-1.5 text-xs">
                    Editar
                  </Button>
                  <PackageActionButton itemId={item.id} action={item.isActive ? "deactivate" : "activate"} />
                </>
              }
            />
          );
        })}
      </div>
    </div>
  );
}
