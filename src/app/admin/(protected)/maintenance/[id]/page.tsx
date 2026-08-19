import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, Mail, UserX } from "lucide-react";
import { getMaintenanceRequestById } from "@/lib/db/maintenanceStore";
import { getClientById } from "@/lib/db/paymentsStore";
import { MaintenanceStatusBadge } from "@/components/admin/MaintenanceStatusBadge";
import { AdminSection } from "@/components/admin/ui/AdminSection";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * /admin/maintenance/[id] — XAYVEN CORE Phase 2, first detail view this
 * table has ever had. Mirrors /admin/contact-requests/[id]'s layout
 * exactly (same Field helper, same AdminSection blocks) so it reads as
 * part of the same Admin, not a bolted-on new pattern.
 *
 * There is no status-change or "vincular cliente" action here on purpose
 * — Phase 2's scope is visibility only (see the architecture audit's MUST
 * HAVE list). `client_id` is resolved once, at submission time
 * (POST /api/maintenance) — this page never invents or fixes a missing
 * link.
 */
export default async function MaintenanceRequestDetailPage({ params }: PageProps) {
  const { id } = await params;
  const request = await getMaintenanceRequestById(id);
  if (!request) notFound();

  // Read-only lookup for display only, same degrade-gracefully discipline
  // as contact-requests/[id]'s linkedClient — if the linked client was
  // since deleted (ON DELETE SET NULL already cleared client_id in that
  // case, so this branch is mostly defensive), never crash the page.
  const linkedClient = request.clientId ? await getClientById(request.clientId) : null;

  return (
    <div>
      <Link
        href="/admin/maintenance"
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{request.name}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {request.company || "Sin empresa"} · {new Date(request.createdAt).toLocaleString("es-CO")}
          </p>
        </div>
        <MaintenanceStatusBadge status={request.status} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <a
          href={`mailto:${request.email}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-bg-raised px-3 py-2 text-sm text-fg transition-colors hover:border-border-accent"
        >
          <Mail className="size-4" aria-hidden="true" />
          Responder por correo
        </a>
      </div>

      <div className="mt-8 space-y-6">
        <AdminSection title="Cliente">
          {linkedClient ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-fg">
                  {linkedClient.name}
                  {linkedClient.company && <span className="text-fg-muted"> — {linkedClient.company}</span>}
                </p>
                <p className="text-xs text-fg-subtle">{linkedClient.email}</p>
              </div>
              <Link
                href={`/admin/clients/${linkedClient.id}`}
                className="inline-flex items-center rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-border-accent hover:text-fg"
              >
                Ver cliente
              </Link>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-fg-subtle">
              <UserX className="size-4 shrink-0" aria-hidden="true" />
              Esta solicitud todavía no está vinculada a ningún cliente. El email no coincidió con ningún
              cliente existente al momento de recibirla.
            </p>
          )}
        </AdminSection>

        <AdminSection title="Datos de contacto">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nombre" value={request.name} />
            <Field label="Email" value={request.email} />
            <Field label="Empresa" value={request.company || "—"} />
            <Field label="Sitio web" value={request.website} />
          </div>
        </AdminSection>

        <AdminSection title="Solicitud">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Necesidad" value={request.need} />
            <Field label="Prioridad" value={request.priority} />
            <Field label="Estado" value={<MaintenanceStatusBadge status={request.status} />} />
          </div>
        </AdminSection>

        <AdminSection title="Mensaje">
          <p className="whitespace-pre-wrap text-sm text-fg">{request.message}</p>
        </AdminSection>

        <AdminSection title="Información de recepción">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha" value={new Date(request.createdAt).toLocaleDateString("es-CO")} />
            <Field label="Hora" value={new Date(request.createdAt).toLocaleTimeString("es-CO")} />
          </div>
        </AdminSection>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated/40 p-4">
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">{label}</p>
      <p className="mt-1 text-sm text-fg">{value}</p>
    </div>
  );
}
