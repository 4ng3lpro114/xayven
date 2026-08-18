import Link from "next/link";
import { Plus } from "lucide-react";
import { listServices } from "@/lib/db/servicesStore";
import { BooleanStatusBadge } from "@/components/admin/BooleanStatusBadge";
import { ServiceActionButton } from "@/components/admin/ServiceActions";

export const dynamic = "force-dynamic";

/** Admin Phase 5 — /admin/services. Same bulk-fetch, server-rendered
 *  list pattern as /admin/promotions and /admin/packages. */
export default async function AdminServicesPage() {
  const services = await listServices();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-fg">Servicios</h1>
          <p className="mt-1 text-sm text-fg-muted">Catálogo comercial de /services — contenido y publicación.</p>
        </div>
        <Link
          href="/admin/services/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-400"
        >
          <Plus className="size-4" aria-hidden="true" />
          Nuevo servicio
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-fg-subtle">No hay servicios todavía.</p>
        )}
        {services.map((service) => (
          <div key={service.id} className="rounded-lg border border-border bg-bg-raised p-5">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/admin/services/${service.id}`} className="text-sm font-semibold text-fg hover:text-accent-300">
                {service.content.es.heading}
              </Link>
              <BooleanStatusBadge active={service.isPublished} activeLabel="Publicado" inactiveLabel="Oculto" />
            </div>

            <p className="mt-2 font-mono text-xs uppercase tracking-[0.1em] text-fg-subtle">
              /services/{service.slug} · orden {service.displayOrder}
            </p>

            <p className="mt-3 line-clamp-2 text-sm text-fg-muted">{service.content.es.tagline}</p>

            <p className="mt-3 text-xs text-fg-subtle">
              {service.relatedPackageSlugs.length > 0
                ? `Paquetes: ${service.relatedPackageSlugs.join(", ")}`
                : "Sin paquete — cotización"}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/admin/services/${service.id}`}
                className="inline-flex items-center rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-border-accent hover:text-fg"
              >
                Editar
              </Link>
              <ServiceActionButton serviceId={service.id} action={service.isPublished ? "unpublish" : "publish"} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
