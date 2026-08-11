import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProjectById, getClientById, listPayments } from "@/lib/db/paymentsStore";
import { pendingAmount } from "@/lib/payments/types";
import { formatMoney } from "@/lib/payments/format";
import { PaymentStatusBadge } from "@/components/payments/PaymentStatusBadge";
import { CopyLinkButton } from "@/components/admin/CopyLinkButton";
import { NewMaintenanceChargeForm } from "@/components/admin/NewMaintenanceChargeForm";
import { ConfirmWiseButtons } from "@/components/admin/ConfirmWiseButtons";
import { SITE_URL } from "@/lib/constants";

const STATUS_LABELS_ES: Record<string, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  DECLINED: "Rechazado",
  ERROR: "Error",
  VOIDED: "Anulado",
  REFUNDED: "Reembolsado",
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) notFound();

  const [client, payments] = await Promise.all([
    getClientById(project.clientId),
    listPayments({ projectId: project.id }),
  ]);

  const portalUrl = `${SITE_URL}/es/portal/${project.portalToken}`;
  const pendingWise = payments.filter((p) => p.provider === "WISE" && p.status === "PENDING");

  return (
    <div>
      <Link
        href="/admin/projects"
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-fg">{project.name}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {client?.name} · {client?.email} · Estado: {project.status}
          </p>
        </div>
        <CopyLinkButton value={portalUrl} label="Copiar enlace del cliente" />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-bg-raised p-4">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">Total</p>
          <p className="mt-1 text-lg font-semibold text-fg">
            {formatMoney(project.totalAmount, project.currency)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-bg-raised p-4">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">Pagado</p>
          <p className="mt-1 text-lg font-semibold text-accent-300">
            {formatMoney(project.paidAmount, project.currency)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-bg-raised p-4">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">
            Pendiente
          </p>
          <p className="mt-1 text-lg font-semibold text-fg">
            {formatMoney(pendingAmount(project), project.currency)}
          </p>
        </div>
      </div>

      <h2 className="mt-10 text-base font-semibold text-fg">Cobrar mantenimiento</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Crea un cobro puntual — no afecta el total/pagado del proyecto. Comparte el enlace de
        pago con el cliente (o dile que ya aparece en su área de proyecto).
      </p>
      <div className="mt-4">
        <NewMaintenanceChargeForm projectId={project.id} />
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
              <th className="px-4 py-3 font-medium">Referencia</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-fg-subtle">
                  Todavía no hay pagos.
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
                <td className="px-4 py-3 font-mono text-xs text-fg-subtle">{p.reference}</td>
                <td className="px-4 py-3">
                  <PaymentStatusBadge status={p.status} label={STATUS_LABELS_ES[p.status]} />
                </td>
                <td className="px-4 py-3">
                  {pendingWise.some((w) => w.id === p.id) && <ConfirmWiseButtons paymentId={p.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
