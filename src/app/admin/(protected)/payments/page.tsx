import Link from "next/link";
import { listPayments } from "@/lib/db/paymentsStore";
import { listProjects, listClients } from "@/lib/db/paymentsStore";
import { formatMoney } from "@/lib/payments/format";
import { PaymentStatusBadge } from "@/components/payments/PaymentStatusBadge";
import { ConfirmWiseButtons } from "@/components/admin/ConfirmWiseButtons";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentStatus } from "@/lib/payments/types";

export const dynamic = "force-dynamic";

const STATUS_LABELS_ES: Record<PaymentStatus, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  DECLINED: "Rechazado",
  ERROR: "Error",
  VOIDED: "Anulado",
  REFUNDED: "Reembolsado",
};

const FILTERS: { key: string; label: string; status?: PaymentStatus }[] = [
  { key: "all", label: "Todos" },
  { key: "pending", label: "Pendientes", status: "PENDING" },
  { key: "approved", label: "Aprobados", status: "APPROVED" },
  { key: "declined", label: "Rechazados", status: "DECLINED" },
  { key: "error", label: "Errores", status: "ERROR" },
  { key: "refunded", label: "Reembolsados", status: "REFUNDED" },
];

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "all" } = await searchParams;
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];

  const [payments, projects, clients] = await Promise.all([
    listPayments({ status: active.status, limit: 200 }),
    listProjects(),
    listClients(),
  ]);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const clientById = new Map(clients.map((c) => [c.id, c]));

  return (
    <div>
      <AdminPageHeader eyebrow="Comercial" title="Pagos" />

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/admin/payments" : `/admin/payments?filter=${f.key}`}
            className={cn(
              "rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors",
              active.key === f.key
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
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Proyecto</th>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 font-medium">Monto</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Referencia</th>
              <th className="px-4 py-3 font-medium">ID transacción</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10">
                  <AdminEmptyState icon={Receipt} title="No hay pagos en esta categoría." />
                </td>
              </tr>
            )}
            {payments.map((p) => {
              const project = projectById.get(p.projectId);
              const client = clientById.get(p.clientId);
              return (
                <tr key={p.id} className="border-b border-border last:border-0 transition-colors hover:bg-bg-elevated">
                  <td className="px-4 py-3 text-fg-muted">{client?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    {project ? (
                      <Link href={`/admin/projects/${project.id}`} className="text-fg hover:text-accent-300">
                        {project.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{p.provider}</td>
                  <td className="px-4 py-3 text-fg">{formatMoney(p.amount, p.currency)}</td>
                  <td className="px-4 py-3">
                    <PaymentStatusBadge status={p.status} label={STATUS_LABELS_ES[p.status]} />
                  </td>
                  <td className="px-4 py-3 text-fg-subtle">
                    {new Date(p.createdAt).toLocaleDateString("es-CO")}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-subtle">{p.reference}</td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-subtle">
                    {p.providerTransactionId ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {p.provider === "WISE" && p.status === "PENDING" && (
                      <ConfirmWiseButtons paymentId={p.id} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 space-y-3 sm:hidden">
        {payments.length === 0 && <AdminEmptyState icon={Receipt} title="No hay pagos en esta categoría." />}
        {payments.map((p) => {
          const project = projectById.get(p.projectId);
          const client = clientById.get(p.clientId);
          return (
            <div key={p.id} className="rounded-xl border border-border bg-bg-raised p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-fg">{client?.name ?? "—"}</p>
                  {project ? (
                    <Link href={`/admin/projects/${project.id}`} className="mt-0.5 text-xs text-accent-300 hover:text-accent-200">
                      {project.name}
                    </Link>
                  ) : (
                    <p className="mt-0.5 text-xs text-fg-subtle">Sin proyecto</p>
                  )}
                </div>
                <PaymentStatusBadge status={p.status} label={STATUS_LABELS_ES[p.status]} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                <span className="text-sm font-medium text-fg">{formatMoney(p.amount, p.currency)}</span>
                <span>{p.provider}</span>
                <span>{new Date(p.createdAt).toLocaleDateString("es-CO")}</span>
              </div>
              <p className="mt-2 font-mono text-[0.7rem] text-fg-subtle">
                {p.reference}
                {p.providerTransactionId && ` · ${p.providerTransactionId}`}
              </p>
              {p.provider === "WISE" && p.status === "PENDING" && (
                <div className="mt-3">
                  <ConfirmWiseButtons paymentId={p.id} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
