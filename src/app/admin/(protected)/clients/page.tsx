import Link from "next/link";
import { listClients, listProjects, listPayments } from "@/lib/db/paymentsStore";
import { listConversations } from "@/lib/db/conversationStore";
import { buildClientSummaries, type ClientSummary } from "@/lib/clients/summary";
import { LeadStatusBadge } from "@/components/admin/LeadStatusBadge";
import { ClientImportanceBadge } from "@/components/admin/ClientImportanceBadge";
import { formatMoney } from "@/lib/payments/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Documented, explicit (Fase 5C Etapa 12): listConversations()/
 * listPayments() default to a limit of 50/100, which is NOT high enough
 * to aggregate across every client without silently truncating counts and
 * sums. Raised explicitly here, same technique already used by
 * countByLeadStatus() (limit: 1000) — comfortably covers this project's
 * current and near-future scale in one bulk query each, same "bulk fetch
 * + in-memory reduce" pattern /admin/projects/page.tsx already uses.
 */
const AGGREGATION_LIMIT = 5000;

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "interested", label: "Interesados" },
  { key: "exploring", label: "Explorando" },
  { key: "client", label: "Clientes" },
  { key: "with_project", label: "Con proyecto" },
  { key: "with_payments", label: "Con pagos" },
];

/** Reuses conversations.lead_status as-is — no second, independent client
 *  status is introduced. "Con proyecto"/"Con pagos" are separate, simple
 *  boolean filters, not merged into lead_status. */
function matchesFilter(filterKey: string, summary: ClientSummary | undefined): boolean {
  if (!summary) return filterKey === "all";
  switch (filterKey) {
    case "interested":
      return summary.leadStatus === "interested";
    case "exploring":
      return summary.leadStatus === "exploring";
    case "client":
      return summary.leadStatus === "client";
    case "with_project":
      return summary.hasProjects;
    case "with_payments":
      return summary.hasPayments;
    default:
      return true;
  }
}

function buildFilterHref(filterKey: string, q: string): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (filterKey !== "all") params.set("filter", filterKey);
  const qs = params.toString();
  return qs ? `/admin/clients?${qs}` : "/admin/clients";
}

function PaidCell({ paidAmount }: { paidAmount: ClientSummary["paidAmount"] }) {
  const entries = Object.entries(paidAmount);
  if (entries.length === 0) return <span>—</span>;
  return (
    <>
      {entries.map(([currency, amount]) => (
        <div key={currency}>{formatMoney(amount, currency)}</div>
      ))}
    </>
  );
}

interface PageProps {
  searchParams: Promise<{ q?: string; filter?: string }>;
}

export default async function AdminClientsPage({ searchParams }: PageProps) {
  const { q = "", filter = "all" } = await searchParams;
  const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0]!;

  const [clients, conversations, projects, payments] = await Promise.all([
    listClients(),
    listConversations({ limit: AGGREGATION_LIMIT }),
    listProjects(),
    listPayments({ limit: AGGREGATION_LIMIT }),
  ]);

  const summaries = buildClientSummaries({ clients, conversations, projects, payments });

  const needle = q.trim().toLowerCase();
  const visibleClients = clients.filter((c) => {
    const matchesQuery =
      !needle || c.name.toLowerCase().includes(needle) || c.email.toLowerCase().includes(needle);
    return matchesQuery && matchesFilter(activeFilter.key, summaries.get(c.id));
  });

  const emptyMessage =
    clients.length === 0 ? "Todavía no hay clientes." : "Ningún cliente coincide con la búsqueda/filtro.";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-fg">Clientes</h1>
        <form method="get" className="flex items-center gap-2">
          {activeFilter.key !== "all" && <input type="hidden" name="filter" value={activeFilter.key} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre o email…"
            className="w-56 rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent-400 focus:outline-none"
          />
        </form>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={buildFilterHref(f.key, q)}
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

      {/* Desktop: tabla. Mobile: tarjetas apiladas — nunca scroll horizontal forzado. */}
      <div className="mt-6 hidden overflow-x-auto rounded-lg border border-border sm:block">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Importancia</th>
              <th className="px-4 py-3 font-medium">Conversaciones</th>
              <th className="px-4 py-3 font-medium">Proyectos</th>
              <th className="px-4 py-3 font-medium">Pagado</th>
              <th className="px-4 py-3 font-medium">Última actividad</th>
            </tr>
          </thead>
          <tbody>
            {visibleClients.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-fg-subtle">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {visibleClients.map((c) => {
              const summary = summaries.get(c.id)!;
              return (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-bg-raised">
                  <td className="px-4 py-3">
                    <Link href={`/admin/clients/${c.id}`} className="text-fg hover:text-accent-300">
                      {c.name}
                    </Link>
                    <p className="text-xs text-fg-subtle">{c.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {summary.leadStatus ? (
                      <LeadStatusBadge status={summary.leadStatus} />
                    ) : (
                      <span className="text-fg-subtle">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ClientImportanceBadge importance={summary.importance} />
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{summary.conversationsCount}</td>
                  <td className="px-4 py-3 text-fg-muted">{summary.projectsCount}</td>
                  <td className="px-4 py-3 text-fg-muted">
                    <PaidCell paidAmount={summary.paidAmount} />
                  </td>
                  <td className="px-4 py-3 text-fg-subtle">
                    {summary.latestActivity
                      ? new Date(summary.latestActivity).toLocaleDateString("es-CO")
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 space-y-3 sm:hidden">
        {visibleClients.length === 0 && (
          <p className="rounded-lg border border-border px-4 py-8 text-center text-sm text-fg-subtle">
            {emptyMessage}
          </p>
        )}
        {visibleClients.map((c) => {
          const summary = summaries.get(c.id)!;
          return (
            <Link
              key={c.id}
              href={`/admin/clients/${c.id}`}
              className="block rounded-lg border border-border bg-bg-raised p-4 transition-colors hover:border-border-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-fg">{c.name}</p>
                  <p className="mt-0.5 text-xs text-fg-subtle">{c.email}</p>
                </div>
                <ClientImportanceBadge importance={summary.importance} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {summary.leadStatus && <LeadStatusBadge status={summary.leadStatus} />}
                <span className="text-xs text-fg-muted">{summary.conversationsCount} conversaciones</span>
                <span className="text-xs text-fg-muted">{summary.projectsCount} proyectos</span>
              </div>
              <div className="mt-2 text-xs text-fg-muted">
                {Object.keys(summary.paidAmount).length === 0
                  ? "Sin pagos"
                  : Object.entries(summary.paidAmount)
                      .map(([currency, amount]) => formatMoney(amount, currency))
                      .join(" · ")}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
