import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { getClientById, listProjects, listPayments } from "@/lib/db/paymentsStore";
import { listConversations, listAllLeadStatusHistory } from "@/lib/db/conversationStore";
import { listContactRequests } from "@/lib/db/contactRequestStore";
import { listMaintenanceRequests } from "@/lib/db/maintenanceStore";
import { listLinkedProfileClientIds } from "@/lib/db/profilesStore";
import { listClientNotes } from "@/lib/db/clientNoteStore";
import { buildClientSummaries } from "@/lib/clients/summary";
import { buildActivityFeed } from "@/lib/clients/activity";
import { getClientProtectionReason } from "@/lib/clients/importance";
import { LeadStatusBadge } from "@/components/admin/LeadStatusBadge";
import { ClientImportanceBadge } from "@/components/admin/ClientImportanceBadge";
import { AccountStatusBadge } from "@/components/admin/AccountStatusBadge";
import { CommercialStatusBadge } from "@/components/admin/CommercialStatusBadge";
import { ClientActions } from "@/components/admin/ClientActions";
import { ClientNotes } from "@/components/admin/ClientNotes";
import { PaymentStatusBadge } from "@/components/payments/PaymentStatusBadge";
import { ProjectStatusBadge } from "@/components/admin/ProjectStatusBadge";
import { ContactRequestStatusBadge } from "@/components/admin/ContactRequestStatusBadge";
import { MaintenanceStatusBadge } from "@/components/admin/MaintenanceStatusBadge";
import { formatMoney } from "@/lib/payments/format";
import { pendingAmount } from "@/lib/payments/types";
import type { PaymentStatus } from "@/lib/payments/types";
import { StatCard } from "@/components/admin/statistics/StatCard";
import { AdminSection } from "@/components/admin/ui/AdminSection";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { Button } from "@/components/ui/Button";

const PAYMENT_STATUS_LABELS_ES: Record<PaymentStatus, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  DECLINED: "Rechazado",
  ERROR: "Error",
  VOIDED: "Anulado",
  REFUNDED: "Reembolsado",
};

// Same reasoning as /admin/clients/page.tsx — a single client's own
// conversations/payments will never realistically approach these limits,
// but the default (50/100) is still raised explicitly rather than assumed
// sufficient, per Fase 5C Etapa 12.
const RELATIONS_LIMIT = 5000;
const ACTIVITY_FEED_LIMIT = 20;

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminClientDetailPage({ params }: PageProps) {
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  const [
    conversations,
    projects,
    payments,
    convertedContactRequests,
    allMaintenanceRequests,
    linkedClientIds,
    allLeadStatusHistory,
    notes,
  ] = await Promise.all([
    listConversations({ clientId: client.id, limit: RELATIONS_LIMIT }),
    listProjects({ clientId: client.id }),
    listPayments({ clientId: client.id, limit: RELATIONS_LIMIT }),
    // listContactRequests() has no clientId filter — same bulk-fetch +
    // in-memory-filter technique as the rest of this codebase (Fase 5C
    // Etapa 12). Only "converted" is relevant here: client_id is only
    // ever set together with status="converted" (linkContactRequestToClient()),
    // so filtering to "converted" first can never exclude a linked request.
    listContactRequests({ status: "converted", limit: RELATIONS_LIMIT }),
    // XAYVEN CORE Phase 2 — listMaintenanceRequests() has no clientId
    // filter either (same store-level limitation as contact requests
    // above); same bulk-fetch + in-memory-filter technique.
    listMaintenanceRequests({ limit: RELATIONS_LIMIT }),
    // Real profiles.client_id relationship — see "Cuenta XAYVEN" below.
    // Was missing on this page until now (only the list view had it) —
    // needed to render "Cuenta XAYVEN: Activa/Inactiva" here.
    listLinkedProfileClientIds(),
    // XAYVEN CORE Phase 3.6 — same bulk-fetch + in-memory-filter technique
    // as contactRequests/maintenanceRequests above. listAllLeadStatusHistory()
    // already existed (Analytics V2) but was never read by the Admin UI —
    // this is its first consumer outside statistics.
    listAllLeadStatusHistory({ limit: RELATIONS_LIMIT }),
    // XAYVEN CORE Phase 3.6 — real server-side filter (client_notes has no
    // whole-table admin listing that would need the bulk-fetch pattern).
    listClientNotes(client.id),
  ]);
  const contactRequests = convertedContactRequests.filter((r) => r.clientId === client.id);
  const maintenanceRequests = allMaintenanceRequests.filter((m) => m.clientId === client.id);
  // Filtered by conversationId, NOT by the history entry's own snapshot
  // clientId — most of a client's actual lead-status progression
  // (exploring → interested → hot) happens BEFORE the conversation ever
  // converts, when that snapshot is still null (see LeadStatusHistoryEntry's
  // doc comment in db/types.ts). Filtering by clientId would silently drop
  // exactly the transitions this timeline exists to show.
  const conversationIds = new Set(conversations.map((c) => c.id));
  const leadStatusHistory = allLeadStatusHistory.filter((h) => conversationIds.has(h.conversationId));

  const summary = buildClientSummaries({
    clients: [client],
    conversations,
    projects,
    payments,
    contactRequests,
    linkedClientIds,
  }).get(client.id)!;

  const activityFeed = buildActivityFeed({
    conversations,
    projects,
    payments,
    maintenanceRequests,
    contactRequests,
    leadStatusHistory,
    notes,
  }).slice(0, ACTIVITY_FEED_LIMIT);

  // "Empresa": `clients.company` (0008_clients_company.sql) is the real
  // column now — populated when a client is created via a "Crear mi
  // proyecto" contact request (see contactRequestConversion.ts). Clients
  // created before that column existed, or via the lead-conversion flow
  // (which still never writes `company` — see Fase 5A audit), fall back
  // to a linked conversation's `company` so nothing regresses for them.
  const company = client.company ?? conversations.find((c) => c.company)?.company ?? null;

  // Misma fuente de verdad que DELETE /api/admin/clients/[id]/route.ts —
  // getClientProtectionReason() nunca se recalcula en paralelo aquí, así
  // que esta página no puede mostrar un motivo distinto al que el backend
  // realmente usaría para bloquear el borrado (Fase 5C-fix-2).
  const protectedReason = getClientProtectionReason({
    leadScore: null,
    leadStatus: null,
    projects,
    hasPayments: payments.length > 0,
  });

  return (
    <div>
      <Link
        href="/admin/clients"
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{client.name}</h1>
          {company && <p className="mt-1 text-sm text-fg-muted">{company}</p>}
          <p className="mt-1 text-sm text-fg-muted">
            {client.email}
            {client.phone && ` · ${client.phone}`} ·{" "}
            {summary.isCommercialClient ? "Cliente desde" : "Registrado desde"}{" "}
            {new Date(client.createdAt).toLocaleDateString("es-CO")}
          </p>
          {/* "Cuenta XAYVEN" (acceso al portal) y "Cliente" (es cliente
           *  comercial de verdad) son dos conceptos independientes —
           *  0012_clients_is_commercial.sql — mostrados explícitamente por
           *  separado como dos filas etiqueta+valor, nunca fusionados en
           *  una sola frase ni implicando que una depende de la otra. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-fg-subtle">Cuenta XAYVEN</span>
              <AccountStatusBadge active={summary.hasAccount} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-fg-subtle">Cliente</span>
              <CommercialStatusBadge isCommercial={summary.isCommercialClient} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* leadStatus === "client" ya queda comunicado por
             *  CommercialStatusBadge arriba — mostrarlo también aquí sería
             *  el mismo hecho duplicado. El resto de estados
             *  (interesado/explorando/caliente/soporte) sí es información
             *  nueva y se sigue mostrando igual que siempre. */}
            {summary.leadStatus && summary.leadStatus !== "client" && (
              <LeadStatusBadge status={summary.leadStatus} />
            )}
            <ClientImportanceBadge importance={summary.importance} />
          </div>
        </div>
        <ClientActions
          clientId={client.id}
          importance={summary.importance}
          protectedReason={protectedReason}
          isCommercial={summary.isCommercialClient}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="Conversaciones" value={summary.conversationsCount} />
        <StatCard label="Proyectos" value={summary.projectsCount} />
        <StatCard label="Pagos" value={payments.length} />
        <StatCard
          label="Actividad"
          value={
            summary.latestActivity ? new Date(summary.latestActivity).toLocaleDateString("es-CO") : "Sin actividad"
          }
        />
      </div>

      <AdminSection title="Actividad reciente">
        <div className="space-y-3">
          {activityFeed.length === 0 ? (
            <AdminEmptyState title="Sin actividad todavía." />
          ) : (
            activityFeed.map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-elevated/40 px-4 py-3"
              >
                <p className="text-sm text-fg-muted">{item.label}</p>
                <p className="whitespace-nowrap text-xs text-fg-subtle">
                  {new Date(item.timestamp).toLocaleDateString("es-CO")}
                </p>
              </div>
            ))
          )}
        </div>
      </AdminSection>

      {/* XAYVEN CORE Phase 3.6 — la única sección donde se lee el contenido
         real de una nota; "Actividad reciente" arriba solo muestra la
         etiqueta fija "Nota interna" (ver buildActivityFeed()). */}
      <AdminSection title="Notas">
        <ClientNotes clientId={client.id} notes={notes} />
      </AdminSection>

      <AdminSection title="Conversaciones">
        <div className="-m-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                <th className="px-6 py-3 font-medium">Fecha</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium">Score</th>
                <th className="px-6 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {conversations.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-fg-subtle">
                    Sin conversaciones vinculadas.
                  </td>
                </tr>
              )}
              {conversations.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 transition-colors hover:bg-bg-elevated">
                  <td className="px-6 py-3 text-fg-subtle">
                    {new Date(c.createdAt).toLocaleDateString("es-CO")}
                  </td>
                  <td className="px-6 py-3">
                    <LeadStatusBadge status={c.leadStatus} />
                  </td>
                  <td className="px-6 py-3 text-fg-muted">{c.leadScore}</td>
                  <td className="px-6 py-3">
                    <Link
                      href={`/admin/conversations/${c.id}`}
                      className="text-accent-300 transition-colors hover:text-accent-200"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSection>

      <AdminSection
        title="Proyectos"
        action={
          <Button href={`/admin/projects/new?clientId=${client.id}`} variant="secondary" size="md">
            <Plus className="size-4" aria-hidden="true" />
            Crear proyecto
          </Button>
        }
      >
        <div className="-m-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                <th className="px-6 py-3 font-medium">Proyecto</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium">Total</th>
                <th className="px-6 py-3 font-medium">Pagado</th>
                <th className="px-6 py-3 font-medium">Pendiente</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-fg-subtle">
                    Sin proyectos vinculados.
                  </td>
                </tr>
              )}
              {projects.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 transition-colors hover:bg-bg-elevated">
                  <td className="px-6 py-3">
                    <Link href={`/admin/projects/${p.id}`} className="text-fg hover:text-accent-300">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-6 py-3">
                    <ProjectStatusBadge status={p.status} />
                  </td>
                  <td className="px-6 py-3 text-fg-muted">{formatMoney(p.totalAmount, p.currency)}</td>
                  <td className="px-6 py-3 text-accent-300">{formatMoney(p.paidAmount, p.currency)}</td>
                  <td className="px-6 py-3 text-fg-muted">
                    {formatMoney(pendingAmount(p), p.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSection>

      <AdminSection title="Pagos">
        <div className="-m-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                <th className="px-6 py-3 font-medium">Fecha</th>
                <th className="px-6 py-3 font-medium">Proveedor</th>
                <th className="px-6 py-3 font-medium">Tipo</th>
                <th className="px-6 py-3 font-medium">Monto</th>
                <th className="px-6 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-fg-subtle">
                    Sin pagos vinculados.
                  </td>
                </tr>
              )}
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-6 py-3 text-fg-subtle">
                    {new Date(p.createdAt).toLocaleDateString("es-CO")}
                  </td>
                  <td className="px-6 py-3 text-fg-muted">{p.provider}</td>
                  <td className="px-6 py-3 text-fg-muted">{p.paymentType}</td>
                  <td className="px-6 py-3 text-fg">{formatMoney(p.amount, p.currency)}</td>
                  <td className="px-6 py-3">
                    <PaymentStatusBadge status={p.status} label={PAYMENT_STATUS_LABELS_ES[p.status]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSection>

      {/* XAYVEN CORE Phase 2 — real data, replacing the hardcoded
         "Mantenimiento no vinculado" placeholder that used to sit here
         (maintenance_requests had no client_id at all before this phase —
         see the Phase 2 architecture audit). */}
      <AdminSection title="Mantenimiento">
        <div className="-m-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                <th className="px-6 py-3 font-medium">Fecha</th>
                <th className="px-6 py-3 font-medium">Necesidad</th>
                <th className="px-6 py-3 font-medium">Prioridad</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {maintenanceRequests.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-fg-subtle">
                    Sin solicitudes de mantenimiento vinculadas.
                  </td>
                </tr>
              )}
              {maintenanceRequests.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0 transition-colors hover:bg-bg-elevated">
                  <td className="px-6 py-3 text-fg-subtle">
                    {new Date(m.createdAt).toLocaleDateString("es-CO")}
                  </td>
                  <td className="px-6 py-3 text-fg-muted">{m.need}</td>
                  <td className="px-6 py-3 text-fg-muted">{m.priority}</td>
                  <td className="px-6 py-3">
                    <MaintenanceStatusBadge status={m.status} />
                  </td>
                  <td className="px-6 py-3">
                    <Link
                      href={`/admin/maintenance/${m.id}`}
                      className="text-accent-300 transition-colors hover:text-accent-200"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSection>

      {/* XAYVEN CORE Phase 2 — the Phase 2 audit found `contactRequests`
         was already fetched on this page (to derive the leadStatus
         fallback above) but never rendered as its own table. Reuses the
         exact same array — no new relation, no new query. */}
      <AdminSection title="Solicitudes">
        <div className="-m-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                <th className="px-6 py-3 font-medium">Fecha</th>
                <th className="px-6 py-3 font-medium">Tipo de proyecto</th>
                <th className="px-6 py-3 font-medium">Presupuesto</th>
                <th className="px-6 py-3 font-medium">Mercado</th>
                <th className="px-6 py-3 font-medium">Moneda</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {contactRequests.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-fg-subtle">
                    Sin solicitudes vinculadas.
                  </td>
                </tr>
              )}
              {contactRequests.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 transition-colors hover:bg-bg-elevated">
                  <td className="px-6 py-3 text-fg-subtle">
                    {new Date(r.createdAt).toLocaleDateString("es-CO")}
                  </td>
                  <td className="px-6 py-3 text-fg-muted">{r.projectType}</td>
                  <td className="px-6 py-3 text-fg-muted">{r.budget}</td>
                  <td className="px-6 py-3 text-fg-muted">{r.marketCode || "—"}</td>
                  <td className="px-6 py-3 text-fg-muted">{r.displayCurrency || "—"}</td>
                  <td className="px-6 py-3">
                    <ContactRequestStatusBadge status={r.status} />
                  </td>
                  <td className="px-6 py-3">
                    <Link
                      href={`/admin/contact-requests/${r.id}`}
                      className="text-accent-300 transition-colors hover:text-accent-200"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSection>
    </div>
  );
}
