import Link from "next/link";
import { Inbox } from "lucide-react";
import { listContactRequests } from "@/lib/db/contactRequestStore";
import { listPricingCatalogItems } from "@/lib/db/pricingCatalogStore";
import { ContactRequestStatusBadge } from "@/components/admin/ContactRequestStatusBadge";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { cn } from "@/lib/utils";
import type { ContactRequest } from "@/lib/db/types";

export const dynamic = "force-dynamic";

/**
 * /admin/contact-requests ("Solicitudes" in the nav) — envíos del CTA
 * público "Crear mi proyecto" (POST /api/contact, ver
 * contactRequestStore.ts). Mismo patrón de tabla-desktop +
 * tarjetas-mobile + filtro por ?filter= vía Link server-rendered que
 * /admin/clients — sin JS de cliente para cambiar de pestaña ni de vista.
 */
const AGGREGATION_LIMIT = 1000;

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "new", label: "Nuevas" },
  { key: "contacted", label: "Contactadas" },
  { key: "converted", label: "Convertidas" },
];

function buildFilterHref(filterKey: string): string {
  return filterKey === "all" ? "/admin/contact-requests" : `/admin/contact-requests?filter=${filterKey}`;
}

const DATE_FORMAT = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" });

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

/** Fase 2 — Pricing Core → Project Request. Read-only display only: no
 *  proposal/negotiation UI here yet (that's the next phase). `null` covers
 *  both Flujo B/C (no plan selected) and pre-Fase-2 historical requests —
 *  deliberately shown the same way, since neither is an error state. */
function requestedPlanLabel(
  pricingCatalogId: string | null,
  catalogNameById: Map<string, string>
): string {
  if (!pricingCatalogId) return "Solicitud personalizada";
  return catalogNameById.get(pricingCatalogId) ?? "Solicitud personalizada";
}

export default async function AdminContactRequestsPage({ searchParams }: PageProps) {
  const { filter = "all" } = await searchParams;
  const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0]!;

  const [requests, catalogItems] = await Promise.all([
    listContactRequests({
      status: activeFilter.key === "all" ? undefined : (activeFilter.key as ContactRequest["status"]),
      limit: AGGREGATION_LIMIT,
    }),
    listPricingCatalogItems(),
  ]);
  const catalogNameById = new Map(catalogItems.map((item) => [item.id, item.name]));

  const emptyMessage =
    activeFilter.key === "all"
      ? "Todavía no hay solicitudes."
      : "Ninguna solicitud coincide con este filtro.";

  return (
    <div>
      <AdminPageHeader
        eyebrow="Comercial"
        title="Solicitudes"
        description="Envíos del formulario público “Crear mi proyecto”."
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

      {/* Desktop: tabla. Mobile: tarjetas apiladas — mismo patrón que /admin/clients. */}
      <div className="mt-6 hidden overflow-x-auto rounded-xl border border-border bg-bg-raised shadow-soft sm:block">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Empresa</th>
              <th className="px-4 py-3 font-medium">Tipo de proyecto</th>
              <th className="px-4 py-3 font-medium">Presupuesto</th>
              <th className="px-4 py-3 font-medium">Plan solicitado</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10">
                  <AdminEmptyState icon={Inbox} title={emptyMessage} />
                </td>
              </tr>
            )}
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 transition-colors hover:bg-bg-elevated">
                <td className="px-4 py-3">
                  <Link href={`/admin/contact-requests/${r.id}`} className="text-fg hover:text-accent-300">
                    {r.name}
                  </Link>
                  <p className="text-xs text-fg-subtle">{r.email}</p>
                </td>
                <td className="px-4 py-3 text-fg-muted">{r.company || "—"}</td>
                <td className="px-4 py-3 text-fg-muted">{r.projectType}</td>
                <td className="px-4 py-3 text-fg-muted">{r.budget}</td>
                <td className="px-4 py-3 text-fg-muted">
                  {requestedPlanLabel(r.pricingCatalogId, catalogNameById)}
                </td>
                <td className="px-4 py-3 text-fg-subtle">{DATE_FORMAT.format(new Date(r.createdAt))}</td>
                <td className="px-4 py-3">
                  <ContactRequestStatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/contact-requests/${r.id}`}
                    className="text-xs font-medium text-fg-muted transition-colors hover:text-fg"
                  >
                    Ver solicitud
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 space-y-3 sm:hidden">
        {requests.length === 0 && <AdminEmptyState icon={Inbox} title={emptyMessage} />}
        {requests.map((r) => (
          <Link
            key={r.id}
            href={`/admin/contact-requests/${r.id}`}
            className="block rounded-xl border border-border bg-bg-raised p-4 shadow-soft transition-colors hover:border-border-accent"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-fg">{r.name}</p>
                <p className="mt-0.5 text-xs text-fg-subtle">{r.email}</p>
              </div>
              <ContactRequestStatusBadge status={r.status} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              {r.company && <span>{r.company}</span>}
              <span>{r.projectType}</span>
              <span>{r.budget}</span>
              <span>{requestedPlanLabel(r.pricingCatalogId, catalogNameById)}</span>
            </div>
            <p className="mt-2 text-xs text-fg-subtle">{DATE_FORMAT.format(new Date(r.createdAt))}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
