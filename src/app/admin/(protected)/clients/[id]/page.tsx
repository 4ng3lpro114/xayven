import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { getClientById, listProjects, listPayments } from "@/lib/db/paymentsStore";
import { listConversations } from "@/lib/db/conversationStore";
import { listContactRequests } from "@/lib/db/contactRequestStore";
import { listLinkedProfileClientIds } from "@/lib/db/profilesStore";
import { buildClientSummaries } from "@/lib/clients/summary";
import { buildActivityFeed } from "@/lib/clients/activity";
import { getClientProtectionReason } from "@/lib/clients/importance";
import { LeadStatusBadge } from "@/components/admin/LeadStatusBadge";
import { ClientImportanceBadge } from "@/components/admin/ClientImportanceBadge";
import { AccountStatusBadge } from "@/components/admin/AccountStatusBadge";
import { CommercialStatusBadge } from "@/components/admin/CommercialStatusBadge";
import { ClientActions } from "@/components/admin/ClientActions";
import { PaymentStatusBadge } from "@/components/payments/PaymentStatusBadge";
import { formatMoney } from "@/lib/payments/format";
import { pendingAmount } from "@/lib/payments/types";
import type { PaymentStatus } from "@/lib/payments/types";

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

  const [conversations, projects, payments, convertedContactRequests, linkedClientIds] = await Promise.all([
    listConversations({ clientId: client.id, limit: RELATIONS_LIMIT }),
    listProjects({ clientId: client.id }),
    listPayments({ clientId: client.id, limit: RELATIONS_LIMIT }),
    // listContactRequests() has no clientId filter — same bulk-fetch +
    // in-memory-filter technique as the rest of this codebase (Fase 5C
    // Etapa 12). Only "converted" is relevant for Estado="Cliente" below.
    listContactRequests({ status: "converted", limit: RELATIONS_LIMIT }),
    // Real profiles.client_id relationship — see "Cuenta XAYVEN" below.
    // Was missing on this page until now (only the list view had it) —
    // needed to render "Cuenta XAYVEN: Activa/Inactiva" here.
    listLinkedProfileClientIds(),
  ]);
  const contactRequests = convertedContactRequests.filter((r) => r.clientId === client.id);

  const summary = buildClientSummaries({
    clients: [client],
    conversations,
    projects,
    payments,
    contactRequests,
    linkedClientIds,
  }).get(client.id)!;

  const activityFeed = buildActivityFeed({ conversations, projects, payments }).slice(
    0,
    ACTIVITY_FEED_LIMIT
  );

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

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-fg">{client.name}</h1>
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
        <div className="rounded-lg border border-border bg-bg-raised p-4">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">
            Conversaciones
          </p>
          <p className="mt-1 text-lg font-semibold text-fg">{summary.conversationsCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-bg-raised p-4">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">
            Proyectos
          </p>
          <p className="mt-1 text-lg font-semibold text-fg">{summary.projectsCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-bg-raised p-4">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">Pagos</p>
          <p className="mt-1 text-lg font-semibold text-fg">{payments.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-bg-raised p-4">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">
            Actividad
          </p>
          <p className="mt-1 text-lg font-semibold text-fg">
            {summary.latestActivity
              ? new Date(summary.latestActivity).toLocaleDateString("es-CO")
              : "Sin actividad"}
          </p>
        </div>
      </div>

      <h2 className="mt-10 text-base font-semibold text-fg">Actividad reciente</h2>
      <div className="mt-4 space-y-3">
        {activityFeed.length === 0 && (
          <p className="rounded-lg border border-border px-4 py-6 text-center text-sm text-fg-subtle">
            Sin actividad todavía.
          </p>
        )}
        {activityFeed.map((item) => (
          <div
            key={`${item.type}-${item.id}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-elevated/40 px-4 py-3"
          >
            <p className="text-sm text-fg-muted">{item.label}</p>
            <p className="whitespace-nowrap text-xs text-fg-subtle">
              {new Date(item.timestamp).toLocaleDateString("es-CO")}
            </p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-base font-semibold text-fg">Conversaciones</h2>
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {conversations.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-fg-subtle">
                  Sin conversaciones vinculadas.
                </td>
              </tr>
            )}
            {conversations.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-bg-raised">
                <td className="px-4 py-3 text-fg-subtle">
                  {new Date(c.createdAt).toLocaleDateString("es-CO")}
                </td>
                <td className="px-4 py-3">
                  <LeadStatusBadge status={c.leadStatus} />
                </td>
                <td className="px-4 py-3 text-fg-muted">{c.leadScore}</td>
                <td className="px-4 py-3">
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

      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-base font-semibold text-fg">Proyectos</h2>
        <Link
          href={`/admin/projects/new?clientId=${client.id}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-400"
        >
          <Plus className="size-4" aria-hidden="true" />
          Crear proyecto
        </Link>
      </div>
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
              <th className="px-4 py-3 font-medium">Proyecto</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Pagado</th>
              <th className="px-4 py-3 font-medium">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-fg-subtle">
                  Sin proyectos vinculados.
                </td>
              </tr>
            )}
            {projects.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-bg-raised">
                <td className="px-4 py-3">
                  <Link href={`/admin/projects/${p.id}`} className="text-fg hover:text-accent-300">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-fg-muted">{p.status}</td>
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

      <h2 className="mt-10 text-base font-semibold text-fg">Pagos</h2>
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Monto</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-fg-subtle">
                  Sin pagos vinculados.
                </td>
              </tr>
            )}
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-fg-subtle">
                  {new Date(p.createdAt).toLocaleDateString("es-CO")}
                </td>
                <td className="px-4 py-3 text-fg-muted">{p.provider}</td>
                <td className="px-4 py-3 text-fg-muted">{p.paymentType}</td>
                <td className="px-4 py-3 text-fg">{formatMoney(p.amount, p.currency)}</td>
                <td className="px-4 py-3">
                  <PaymentStatusBadge status={p.status} label={PAYMENT_STATUS_LABELS_ES[p.status]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-base font-semibold text-fg">Mantenimiento</h2>
      <div className="mt-4">
        <p className="rounded-lg border border-border px-4 py-6 text-center text-sm text-fg-subtle">
          Mantenimiento no vinculado.
        </p>
      </div>
    </div>
  );
}
