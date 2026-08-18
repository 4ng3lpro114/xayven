import Link from "next/link";
import { listClients, listProjects, listPayments } from "@/lib/db/paymentsStore";
import { listConversations } from "@/lib/db/conversationStore";
import { listContactRequests } from "@/lib/db/contactRequestStore";
import { listLinkedProfileClientIds } from "@/lib/db/profilesStore";
import { buildClientSummaries, type ClientSummary } from "@/lib/clients/summary";
import { LeadStatusBadge } from "@/components/admin/LeadStatusBadge";
import { ClientImportanceBadge } from "@/components/admin/ClientImportanceBadge";
import { AccountBadge } from "@/components/admin/AccountBadge";
import { CommercialStatusBadge } from "@/components/admin/CommercialStatusBadge";
import { formatMoney } from "@/lib/payments/format";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { Users } from "lucide-react";
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

/** Independent second filter dimension — combines with FILTERS above via
 *  AND (both must match), never replaces it. "Con cuenta" + "Sin
 *  proyecto" is expressed as two separate query params (account=with +
 *  filter=... — there's no "sin proyecto" in FILTERS today, but the
 *  mechanism is the same one "with_project" already uses), not a new
 *  combined enum. */
const ACCOUNT_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "with", label: "Con cuenta" },
  { key: "without", label: "Sin cuenta" },
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
      // 0012_clients_is_commercial.sql: isCommercialClient is the real,
      // authoritative "es cliente comercial" signal now — a direct
      // passthrough of clients.is_commercial — instead of the previous
      // leadStatus === "client" proxy (which stays correct for every
      // pre-existing commercial client, since Lead → Cliente/Solicitud →
      // Cliente always set both together, but was never true for a client
      // whose relevant conversation status later changed away from
      // "client" while the commercial relationship itself never un-does).
      return summary.isCommercialClient;
    case "with_project":
      return summary.hasProjects;
    case "with_payments":
      return summary.hasPayments;
    default:
      return true;
  }
}

/** Same "read summary.hasAccount, no inference" discipline as
 *  matchesFilter above — a client with no summary at all (shouldn't
 *  happen, buildClientSummaries covers every client) is treated as
 *  no-account, never as a match for "with". */
function matchesAccountFilter(accountKey: string, summary: ClientSummary | undefined): boolean {
  switch (accountKey) {
    case "with":
      return Boolean(summary?.hasAccount);
    case "without":
      return !summary?.hasAccount;
    default:
      return true;
  }
}

/**
 * Columna Estado — 0012_clients_is_commercial.sql UX pass: 4 combinaciones
 * posibles de (hasAccount, isCommercialClient), nunca inferidas entre sí.
 *   1. leadStatus real (interesado/explorando/caliente/cliente/soporte) →
 *      siempre gana, es la señal más específica que existe.
 *   2. Sin leadStatus, pero hay cuenta O es cliente comercial → se
 *      reutiliza CommercialStatusBadge (mismo componente que el detalle
 *      del cliente) para decir explícitamente "Cliente"/"Sin cliente" —
 *      nunca una raya "—" ambigua que antes se leía igual tuviera o no
 *      cuenta vinculada.
 *   3. Ni cuenta ni cliente comercial → "—" (caso residual, hoy
 *      inalcanzable en la práctica porque toda fila en `clients` se crea
 *      o bien comercial, o bien con cuenta vinculada — pero se maneja
 *      igual, sin asumir que nunca ocurrirá).
 */
function EstadoCell({ summary }: { summary: ClientSummary }) {
  if (summary.leadStatus) return <LeadStatusBadge status={summary.leadStatus} />;
  if (summary.isCommercialClient || summary.hasAccount) {
    return <CommercialStatusBadge isCommercial={summary.isCommercialClient} />;
  }
  return <span className="text-fg-subtle">—</span>;
}

/** Builds an /admin/clients URL preserving whichever of q/filter/account
 *  isn't the one currently being changed — this is what lets the two
 *  filter rows combine (clicking an account pill keeps the active
 *  lead-status filter, and vice versa) instead of one resetting the
 *  other. */
function buildHref(params: { q: string; filter: string; account: string }): string {
  const usp = new URLSearchParams();
  if (params.q) usp.set("q", params.q);
  if (params.filter !== "all") usp.set("filter", params.filter);
  if (params.account !== "all") usp.set("account", params.account);
  const qs = usp.toString();
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
  searchParams: Promise<{ q?: string; filter?: string; account?: string }>;
}

export default async function AdminClientsPage({ searchParams }: PageProps) {
  const { q = "", filter = "all", account = "all" } = await searchParams;
  const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0]!;
  const activeAccountFilter = ACCOUNT_FILTERS.find((f) => f.key === account) ?? ACCOUNT_FILTERS[0]!;

  const [clients, conversations, projects, payments, contactRequests, linkedClientIds] = await Promise.all([
    listClients(),
    listConversations({ limit: AGGREGATION_LIMIT }),
    listProjects(),
    listPayments({ limit: AGGREGATION_LIMIT }),
    // Only "converted" is relevant for deriving Estado="Cliente" below —
    // same reasoning as the other bulk fetches above (Fase 5C Etapa 12).
    listContactRequests({ status: "converted", limit: AGGREGATION_LIMIT }),
    // Real profiles.client_id relationship — see AccountBadge/"Cuenta"
    // column below. Never inferred from name/email.
    listLinkedProfileClientIds(),
  ]);

  const summaries = buildClientSummaries({
    clients,
    conversations,
    projects,
    payments,
    contactRequests,
    linkedClientIds,
  });

  const needle = q.trim().toLowerCase();
  const visibleClients = clients.filter((c) => {
    const matchesQuery =
      !needle || c.name.toLowerCase().includes(needle) || c.email.toLowerCase().includes(needle);
    const summary = summaries.get(c.id);
    return (
      matchesQuery &&
      matchesFilter(activeFilter.key, summary) &&
      matchesAccountFilter(activeAccountFilter.key, summary)
    );
  });

  const emptyMessage =
    clients.length === 0 ? "Todavía no hay clientes." : "Ningún cliente coincide con la búsqueda/filtro.";

  return (
    <div>
      <AdminPageHeader
        eyebrow="Comercial"
        title="Clientes"
        action={
          <form method="get" className="flex items-center gap-2">
            {activeFilter.key !== "all" && <input type="hidden" name="filter" value={activeFilter.key} />}
            {activeAccountFilter.key !== "all" && (
              <input type="hidden" name="account" value={activeAccountFilter.key} />
            )}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Buscar por nombre o email…"
              className="w-56 rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent-400 focus:outline-none"
            />
          </form>
        }
      />

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={buildHref({ q, filter: f.key, account: activeAccountFilter.key })}
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

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-fg-subtle">Cuenta:</span>
        {ACCOUNT_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={buildHref({ q, filter: activeFilter.key, account: f.key })}
            className={cn(
              "rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors",
              activeAccountFilter.key === f.key
                ? "border-border-accent bg-bg-elevated text-fg"
                : "border-border-strong text-fg-muted hover:text-fg"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Desktop: tabla. Mobile: tarjetas apiladas — nunca scroll horizontal forzado. */}
      <div className="mt-6 hidden overflow-x-auto rounded-xl border border-border bg-bg-raised shadow-soft sm:block">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Cuenta</th>
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
                <td colSpan={8} className="px-4 py-10">
                  <AdminEmptyState icon={Users} title={emptyMessage} />
                </td>
              </tr>
            )}
            {visibleClients.map((c) => {
              const summary = summaries.get(c.id)!;
              return (
                <tr key={c.id} className="border-b border-border last:border-0 transition-colors hover:bg-bg-elevated">
                  <td className="px-4 py-3">
                    <Link href={`/admin/clients/${c.id}`} className="text-fg hover:text-accent-300">
                      {c.name}
                    </Link>
                    <p className="text-xs text-fg-subtle">{c.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {summary.hasAccount ? <AccountBadge /> : <span className="text-fg-subtle">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <EstadoCell summary={summary} />
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
        {visibleClients.length === 0 && <AdminEmptyState icon={Users} title={emptyMessage} />}
        {visibleClients.map((c) => {
          const summary = summaries.get(c.id)!;
          return (
            <Link
              key={c.id}
              href={`/admin/clients/${c.id}`}
              className="block rounded-xl border border-border bg-bg-raised p-4 shadow-soft transition-colors hover:border-border-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-fg">{c.name}</p>
                  <p className="mt-0.5 text-xs text-fg-subtle">{c.email}</p>
                </div>
                <ClientImportanceBadge importance={summary.importance} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {summary.hasAccount && <AccountBadge />}
                <EstadoCell summary={summary} />
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
