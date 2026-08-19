import Link from "next/link";
import { Wrench } from "lucide-react";
import { listMaintenanceRequests } from "@/lib/db/maintenanceStore";
import { listClients } from "@/lib/db/paymentsStore";
import { MaintenanceStatusBadge } from "@/components/admin/MaintenanceStatusBadge";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { cn } from "@/lib/utils";
import type { MaintenanceRequest } from "@/lib/db/types";

export const dynamic = "force-dynamic";

/**
 * /admin/maintenance ("Mantenimiento" in the nav) — envíos del formulario
 * público /maintenance (POST /api/maintenance, ver maintenanceStore.ts).
 * XAYVEN CORE Phase 2: primera superficie admin real para esta tabla —
 * antes de esta fase, listMaintenanceRequests() solo se usaba para
 * agregados en /admin/statistics, sin ninguna vista de lista/detalle.
 * Mismo patrón de tabla-desktop + tarjetas-mobile + filtro por ?filter=
 * vía Link server-rendered que /admin/contact-requests — no se inventa un
 * patrón visual nuevo.
 *
 * `listMaintenanceRequests()` no soporta filtro por status a nivel de
 * store (a diferencia de listContactRequests()) — mismo "bulk fetch +
 * filtro en memoria" que /admin/clients y countByLeadStatus ya usan en
 * este codebase, no una limitación nueva introducida aquí.
 */
const AGGREGATION_LIMIT = 1000;

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "new", label: "Nuevas" },
  { key: "contacted", label: "Contactadas" },
  { key: "resolved", label: "Resueltas" },
];

function buildFilterHref(filterKey: string): string {
  return filterKey === "all" ? "/admin/maintenance" : `/admin/maintenance?filter=${filterKey}`;
}

const DATE_FORMAT = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" });

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function AdminMaintenancePage({ searchParams }: PageProps) {
  const { filter = "all" } = await searchParams;
  const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0]!;

  const [allRequests, clients] = await Promise.all([
    listMaintenanceRequests({ limit: AGGREGATION_LIMIT }),
    listClients(),
  ]);
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const requests: MaintenanceRequest[] =
    activeFilter.key === "all" ? allRequests : allRequests.filter((r) => r.status === activeFilter.key);

  const emptyMessage =
    activeFilter.key === "all"
      ? "Todavía no hay solicitudes de mantenimiento."
      : "Ninguna solicitud coincide con este filtro.";

  return (
    <div>
      <AdminPageHeader
        eyebrow="Comercial"
        title="Mantenimiento"
        description="Envíos del formulario público de soporte / mantenimiento."
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

      {/* Desktop: tabla. Mobile: tarjetas apiladas — mismo patrón que
         /admin/contact-requests. */}
      <div className="mt-6 hidden overflow-x-auto rounded-xl border border-border bg-bg-raised shadow-soft sm:block">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
              <th className="px-4 py-3 font-medium">Solicitud</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Necesidad</th>
              <th className="px-4 py-3 font-medium">Prioridad</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10">
                  <AdminEmptyState icon={Wrench} title={emptyMessage} />
                </td>
              </tr>
            )}
            {requests.map((r) => {
              const client = r.clientId ? clientById.get(r.clientId) : null;
              return (
                <tr key={r.id} className="border-b border-border last:border-0 transition-colors hover:bg-bg-elevated">
                  <td className="px-4 py-3">
                    <Link href={`/admin/maintenance/${r.id}`} className="text-fg hover:text-accent-300">
                      {r.name}
                    </Link>
                    <p className="text-xs text-fg-subtle">{r.email}</p>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {client ? (
                      <Link href={`/admin/clients/${client.id}`} className="text-accent-300 hover:text-accent-200">
                        {client.name}
                      </Link>
                    ) : (
                      <span className="text-fg-subtle">Sin vincular</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{r.need}</td>
                  <td className="px-4 py-3 text-fg-muted">{r.priority}</td>
                  <td className="px-4 py-3 text-fg-subtle">{DATE_FORMAT.format(new Date(r.createdAt))}</td>
                  <td className="px-4 py-3">
                    <MaintenanceStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/maintenance/${r.id}`}
                      className="text-xs font-medium text-fg-muted transition-colors hover:text-fg"
                    >
                      Ver solicitud
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 space-y-3 sm:hidden">
        {requests.length === 0 && <AdminEmptyState icon={Wrench} title={emptyMessage} />}
        {requests.map((r) => {
          const client = r.clientId ? clientById.get(r.clientId) : null;
          return (
            <Link
              key={r.id}
              href={`/admin/maintenance/${r.id}`}
              className="block rounded-xl border border-border bg-bg-raised p-4 shadow-soft transition-colors hover:border-border-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-fg">{r.name}</p>
                  <p className="mt-0.5 text-xs text-fg-subtle">{r.email}</p>
                </div>
                <MaintenanceStatusBadge status={r.status} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                <span>{client ? client.name : "Sin vincular"}</span>
                <span>{r.need}</span>
                <span>{r.priority}</span>
              </div>
              <p className="mt-2 text-xs text-fg-subtle">{DATE_FORMAT.format(new Date(r.createdAt))}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
