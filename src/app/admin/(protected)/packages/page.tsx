import Link from "next/link";
import { Plus } from "lucide-react";
import { listPricingCatalogItems } from "@/lib/db/pricingCatalogStore";
import { formatMoney } from "@/lib/payments/format";
import { BooleanStatusBadge } from "@/components/admin/BooleanStatusBadge";
import { PackageActionButton } from "@/components/admin/PackageActions";
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-fg">Paquetes y mantenimiento</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Pricing Core — fuente única de precios para Services y Maintenance.
          </p>
        </div>
        <Link
          href="/admin/packages/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-400"
        >
          <Plus className="size-4" aria-hidden="true" />
          Nuevo producto
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
        {items.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-fg-subtle">
            No hay productos en esta categoría todavía.
          </p>
        )}
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-border bg-bg-raised p-5">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/admin/packages/${item.id}`} className="text-sm font-semibold text-fg hover:text-accent-300">
                {item.name}
              </Link>
              <BooleanStatusBadge active={item.isActive} activeLabel="Activo" inactiveLabel="Inactivo" />
            </div>

            <p className="mt-2 font-mono text-xs uppercase tracking-[0.1em] text-fg-subtle">
              {item.category === "package" ? "Paquete web" : "Mantenimiento"} · {item.slug}
            </p>

            <p className="mt-3 text-lg font-semibold text-accent-300">
              {item.priceType === "FROM" ? "Desde " : ""}
              {formatMoney(item.basePrice, item.currency)}
              {item.billingInterval === "MONTHLY" ? "/mes" : ""}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/admin/packages/${item.id}`}
                className="inline-flex items-center rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-border-accent hover:text-fg"
              >
                Editar
              </Link>
              <PackageActionButton itemId={item.id} action={item.isActive ? "deactivate" : "activate"} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
