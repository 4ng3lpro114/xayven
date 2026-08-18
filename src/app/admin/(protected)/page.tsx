import Link from "next/link";
import { listConversations, countByLeadStatus } from "@/lib/db/conversationStore";
import { isConversationStorePersistent } from "@/lib/db/conversationStore";
import { LeadStatusBadge } from "@/components/admin/LeadStatusBadge";
import { StatCard } from "@/components/admin/statistics/StatCard";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { MessagesSquare } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Admin UI Polish — same data/calculations as before (countByLeadStatus,
 * listConversations({ limit: 20 })), only presentation changed: metric
 * tiles now reuse StatCard (the exact pattern Estadísticas already
 * established) instead of a bespoke div, and the table gets SaaS-level
 * spacing/hover/empty-state polish instead of flat Excel rows. Table kept
 * as a table — 20 comparable conversation records is exactly the shape a
 * table is right for.
 */
export default async function AdminDashboardPage() {
  const [counts, recent, persistent] = await Promise.all([
    countByLeadStatus(),
    listConversations({ limit: 20 }),
    Promise.resolve(isConversationStorePersistent()),
  ]);

  const tiles = [
    { label: "Conversaciones totales", value: counts.total },
    { label: "Leads calientes", value: counts.hot, accent: true },
    { label: "Interesados", value: counts.interested },
    { label: "Explorando", value: counts.exploring },
  ];

  return (
    <div>
      <AdminPageHeader eyebrow="General" title="Dashboard" description="Resumen de conversaciones y leads capturados por XAYVEN AI." />

      {!persistent && (
        <div className="mt-6 rounded-lg border border-border-accent bg-bg-raised px-4 py-3 text-sm text-fg-muted">
          Supabase no está configurado — estas conversaciones se guardan solo en memoria
          mientras el servidor sigue corriendo (se pierden al reiniciar). Ver README.
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <StatCard key={tile.label} label={tile.label} value={tile.value} accent={tile.accent} />
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold text-fg">Conversaciones recientes</h2>

      {recent.length === 0 ? (
        <div className="mt-4">
          <AdminEmptyState icon={MessagesSquare} title="Todavía no hay conversaciones" />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-bg-raised shadow-soft">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 font-medium">Necesidad</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 transition-colors hover:bg-bg-elevated">
                  <td className="px-4 py-3">
                    <Link href={`/admin/conversations/${c.id}`} className="font-medium text-fg hover:text-accent-300">
                      {c.visitorName || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{c.company || "—"}</td>
                  <td className="px-4 py-3 text-fg-muted">{c.need || c.projectType || "—"}</td>
                  <td className="px-4 py-3">
                    <LeadStatusBadge status={c.leadStatus} />
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{c.leadScore}</td>
                  <td className="px-4 py-3 text-fg-subtle">
                    {new Date(c.updatedAt).toLocaleDateString("es-CO", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
