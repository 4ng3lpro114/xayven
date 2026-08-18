import Link from "next/link";
import { Plus, FolderKanban } from "lucide-react";
import { listProjects, listClients } from "@/lib/db/paymentsStore";
import { pendingAmount } from "@/lib/payments/types";
import { formatMoney } from "@/lib/payments/format";
import { ProjectStatusBadge } from "@/components/admin/ProjectStatusBadge";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/lib/payments/types";

export const dynamic = "force-dynamic";

/**
 * Admin UI Polish — Phase 2. `listProjects()` has no status/search filter
 * at the store level (only `clientId`) — same "bulk fetch, filter in
 * memory" pattern already used by /admin/clients, /admin/payments and
 * /admin/promotions, not a new architecture. Nothing added to the store,
 * the API, or the DB — this is a presentation-layer filter over data
 * already fetched in full.
 */
const FILTERS: { key: string; label: string; status?: ProjectStatus }[] = [
  { key: "all", label: "Todos" },
  { key: "lead", label: "Lead", status: "lead" },
  { key: "proposal", label: "Propuesta enviada", status: "proposal" },
  { key: "awaiting_payment", label: "Esperando pago", status: "awaiting_payment" },
  { key: "active", label: "Activo", status: "active" },
  { key: "in_progress", label: "En progreso", status: "in_progress" },
  { key: "review", label: "En revisión", status: "review" },
  { key: "completed", label: "Completado", status: "completed" },
  { key: "maintenance", label: "Mantenimiento", status: "maintenance" },
  { key: "cancelled", label: "Cancelado", status: "cancelled" },
];

function buildHref(params: { q: string; filter: string }): string {
  const usp = new URLSearchParams();
  if (params.q) usp.set("q", params.q);
  if (params.filter !== "all") usp.set("filter", params.filter);
  const qs = usp.toString();
  return qs ? `/admin/projects?${qs}` : "/admin/projects";
}

interface PageProps {
  searchParams: Promise<{ q?: string; filter?: string }>;
}

export default async function AdminProjectsPage({ searchParams }: PageProps) {
  const { q = "", filter = "all" } = await searchParams;
  const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0]!;

  const [projects, clients] = await Promise.all([listProjects(), listClients()]);
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const needle = q.trim().toLowerCase();
  const visibleProjects = projects.filter((p) => {
    const matchesStatus = !activeFilter.status || p.status === activeFilter.status;
    const clientName = clientById.get(p.clientId)?.name ?? "";
    const matchesQuery =
      !needle || p.name.toLowerCase().includes(needle) || clientName.toLowerCase().includes(needle);
    return matchesStatus && matchesQuery;
  });

  const emptyMessage =
    projects.length === 0 ? "Todavía no hay proyectos." : "Ningún proyecto coincide con la búsqueda/filtro.";

  return (
    <div>
      <AdminPageHeader
        eyebrow="Comercial"
        title="Proyectos"
        action={
          <div className="flex items-center gap-2">
            <form method="get" className="flex items-center gap-2">
              {activeFilter.key !== "all" && <input type="hidden" name="filter" value={activeFilter.key} />}
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Buscar por proyecto o cliente…"
                className="w-56 rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent-400 focus:outline-none"
              />
            </form>
            <Button href="/admin/projects/new" variant="secondary" size="md">
              <Plus className="size-4" aria-hidden="true" />
              Nuevo proyecto
            </Button>
          </div>
        }
      />

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={buildHref({ q, filter: f.key })}
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
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
              <th className="px-4 py-3 font-medium">Proyecto</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Pagado</th>
              <th className="px-4 py-3 font-medium">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {visibleProjects.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10">
                  <AdminEmptyState icon={FolderKanban} title={emptyMessage} />
                </td>
              </tr>
            )}
            {visibleProjects.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0 transition-colors hover:bg-bg-elevated">
                <td className="px-4 py-3">
                  <Link href={`/admin/projects/${p.id}`} className="font-medium text-fg hover:text-accent-300">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-fg-muted">{clientById.get(p.clientId)?.name ?? "—"}</td>
                <td className="px-4 py-3">
                  <ProjectStatusBadge status={p.status} />
                </td>
                <td className="px-4 py-3 text-fg-muted">{formatMoney(p.totalAmount, p.currency)}</td>
                <td className="px-4 py-3 text-accent-300">{formatMoney(p.paidAmount, p.currency)}</td>
                <td className="px-4 py-3 text-fg-muted">
                  {formatMoney(pendingAmount(p), p.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 space-y-3 sm:hidden">
        {visibleProjects.length === 0 && <AdminEmptyState icon={FolderKanban} title={emptyMessage} />}
        {visibleProjects.map((p) => (
          <Link
            key={p.id}
            href={`/admin/projects/${p.id}`}
            className="block rounded-xl border border-border bg-bg-raised p-4 shadow-soft transition-colors hover:border-border-accent"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-fg">{p.name}</p>
                <p className="mt-0.5 text-xs text-fg-subtle">{clientById.get(p.clientId)?.name ?? "—"}</p>
              </div>
              <ProjectStatusBadge status={p.status} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
              <span>Total {formatMoney(p.totalAmount, p.currency)}</span>
              <span className="text-accent-300">Pagado {formatMoney(p.paidAmount, p.currency)}</span>
              <span>Pendiente {formatMoney(pendingAmount(p), p.currency)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
