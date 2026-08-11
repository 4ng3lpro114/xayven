import Link from "next/link";
import { listPayments } from "@/lib/db/paymentsStore";
import { listProjects, listClients } from "@/lib/db/paymentsStore";
import { formatMoney } from "@/lib/payments/format";
import { PaymentStatusBadge } from "@/components/payments/PaymentStatusBadge";
import { ConfirmWiseButtons } from "@/components/admin/ConfirmWiseButtons";
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
      <h1 className="text-xl font-semibold text-fg">Pagos</h1>

      <div className="mt-4 flex flex-wrap gap-2">
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

      <div className="mt-6 overflow-x-auto rounded-lg border border-border">
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
                <td colSpan={9} className="px-4 py-8 text-center text-fg-subtle">
                  No hay pagos en esta categoría.
                </td>
              </tr>
            )}
            {payments.map((p) => {
              const project = projectById.get(p.projectId);
              const client = clientById.get(p.clientId);
              return (
                <tr key={p.id} className="border-b border-border last:border-0">
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
    </div>
  );
}
