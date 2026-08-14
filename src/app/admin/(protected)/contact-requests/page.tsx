import Link from "next/link";
import { listContactRequests } from "@/lib/db/contactRequestStore";
import { ContactRequestStatusBadge } from "@/components/admin/ContactRequestStatusBadge";
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

export default async function AdminContactRequestsPage({ searchParams }: PageProps) {
  const { filter = "all" } = await searchParams;
  const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0]!;

  const requests = await listContactRequests({
    status: activeFilter.key === "all" ? undefined : (activeFilter.key as ContactRequest["status"]),
    limit: AGGREGATION_LIMIT,
  });

  const emptyMessage =
    activeFilter.key === "all"
      ? "Todavía no hay solicitudes."
      : "Ninguna solicitud coincide con este filtro.";

  return (
    <div>
      <h1 className="text-xl font-semibold text-fg">Solicitudes</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Envíos del formulario público &ldquo;Crear mi proyecto&rdquo;.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
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
      <div className="mt-6 hidden overflow-x-auto rounded-lg border border-border sm:block">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Empresa</th>
              <th className="px-4 py-3 font-medium">Tipo de proyecto</th>
              <th className="px-4 py-3 font-medium">Presupuesto</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-fg-subtle">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-bg-raised">
                <td className="px-4 py-3">
                  <Link href={`/admin/contact-requests/${r.id}`} className="text-fg hover:text-accent-300">
                    {r.name}
                  </Link>
                  <p className="text-xs text-fg-subtle">{r.email}</p>
                </td>
                <td className="px-4 py-3 text-fg-muted">{r.company || "—"}</td>
                <td className="px-4 py-3 text-fg-muted">{r.projectType}</td>
                <td className="px-4 py-3 text-fg-muted">{r.budget}</td>
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
        {requests.length === 0 && (
          <p className="rounded-lg border border-border px-4 py-8 text-center text-sm text-fg-subtle">
            {emptyMessage}
          </p>
        )}
        {requests.map((r) => (
          <Link
            key={r.id}
            href={`/admin/contact-requests/${r.id}`}
            className="block rounded-lg border border-border bg-bg-raised p-4 transition-colors hover:border-border-accent"
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
            </div>
            <p className="mt-2 text-xs text-fg-subtle">{DATE_FORMAT.format(new Date(r.createdAt))}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
