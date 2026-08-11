import Link from "next/link";
import { listConversations, countByLeadStatus } from "@/lib/db/conversationStore";
import { isConversationStorePersistent } from "@/lib/db/conversationStore";
import { LeadStatusBadge } from "@/components/admin/LeadStatusBadge";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [counts, recent, persistent] = await Promise.all([
    countByLeadStatus(),
    listConversations({ limit: 20 }),
    Promise.resolve(isConversationStorePersistent()),
  ]);

  const tiles = [
    { label: "Conversaciones totales", value: counts.total },
    { label: "Leads calientes", value: counts.hot },
    { label: "Interesados", value: counts.interested },
    { label: "Explorando", value: counts.exploring },
  ];

  return (
    <div>
      {!persistent && (
        <div className="mb-8 rounded-lg border border-border-accent bg-bg-raised px-4 py-3 text-sm text-fg-muted">
          Supabase no está configurado — estas conversaciones se guardan solo en memoria
          mientras el servidor sigue corriendo (se pierden al reiniciar). Ver README.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg border border-border bg-bg-raised p-5">
            <p className="text-2xl font-semibold text-fg">{tile.value}</p>
            <p className="mt-1 text-sm text-fg-muted">{tile.label}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold text-fg">Conversaciones recientes</h2>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
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
            {recent.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-fg-subtle">
                  Todavía no hay conversaciones.
                </td>
              </tr>
            )}
            {recent.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-bg-raised">
                <td className="px-4 py-3">
                  <Link href={`/admin/conversations/${c.id}`} className="text-fg hover:text-accent-300">
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
    </div>
  );
}
