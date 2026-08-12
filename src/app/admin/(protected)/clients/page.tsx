import Link from "next/link";
import { listClients } from "@/lib/db/paymentsStore";

export const dynamic = "force-dynamic";

export default async function AdminClientsPage() {
  const clients = await listClients();

  return (
    <div>
      <h1 className="text-xl font-semibold text-fg">Clientes</h1>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Teléfono</th>
              <th className="px-4 py-3 font-medium">Creado</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-fg-subtle">
                  Todavía no hay clientes.
                </td>
              </tr>
            )}
            {clients.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-bg-raised">
                <td className="px-4 py-3">
                  <Link href={`/admin/clients/${c.id}`} className="text-fg hover:text-accent-300">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-fg-muted">{c.email}</td>
                <td className="px-4 py-3 text-fg-muted">{c.phone ?? "—"}</td>
                <td className="px-4 py-3 text-fg-subtle">
                  {new Date(c.createdAt).toLocaleDateString("es-CO")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
