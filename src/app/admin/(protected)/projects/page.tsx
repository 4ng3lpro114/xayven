import Link from "next/link";
import { Plus } from "lucide-react";
import { listProjects, listClients } from "@/lib/db/paymentsStore";
import { pendingAmount } from "@/lib/payments/types";
import { formatMoney } from "@/lib/payments/format";

export const dynamic = "force-dynamic";

export default async function AdminProjectsPage() {
  const [projects, clients] = await Promise.all([listProjects(), listClients()]);
  const clientById = new Map(clients.map((c) => [c.id, c]));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-fg">Proyectos</h1>
        <Link
          href="/admin/projects/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-400"
        >
          <Plus className="size-4" aria-hidden="true" />
          Nuevo proyecto
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border">
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
            {projects.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-fg-subtle">
                  Todavía no hay proyectos.
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
                <td className="px-4 py-3 text-fg-muted">{clientById.get(p.clientId)?.name ?? "—"}</td>
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
    </div>
  );
}
