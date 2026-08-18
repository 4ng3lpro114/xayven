import { Plus, Layers } from "lucide-react";
import { listServices } from "@/lib/db/servicesStore";
import { BooleanStatusBadge } from "@/components/admin/BooleanStatusBadge";
import { ServiceActionButton } from "@/components/admin/ServiceActions";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEntityCard } from "@/components/admin/ui/AdminEntityCard";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

/** Admin Phase 5 — /admin/services. Same bulk-fetch, server-rendered
 *  list pattern as /admin/promotions and /admin/packages.
 *
 *  Admin UI Polish — restyled onto AdminPageHeader/AdminEntityCard, the
 *  same shared list-card /admin/packages and /admin/markets now use, so
 *  Services stops looking like a separate, unrelated CRUD. */
export default async function AdminServicesPage() {
  const services = await listServices();

  return (
    <div>
      <AdminPageHeader
        eyebrow="Catálogo"
        title="Servicios"
        description="Catálogo comercial de /services — contenido editorial y publicación."
        action={
          <Button href="/admin/services/new" size="md">
            <Plus className="size-4" aria-hidden="true" />
            Nuevo servicio
          </Button>
        }
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.length === 0 && <AdminEmptyState icon={Layers} title="No hay servicios todavía" />}
        {services.map((service) => (
          <AdminEntityCard
            key={service.id}
            href={`/admin/services/${service.id}`}
            title={service.content.es.heading}
            badge={<BooleanStatusBadge active={service.isPublished} activeLabel="Publicado" inactiveLabel="Oculto" />}
            meta={`/services/${service.slug} · orden ${service.displayOrder}`}
            description={
              <>
                <span className="line-clamp-2">{service.content.es.tagline}</span>
                <span className="mt-2 block text-xs text-fg-subtle">
                  {service.relatedPackageSlugs.length > 0
                    ? `Paquetes: ${service.relatedPackageSlugs.join(", ")}`
                    : "Sin paquete — cotización"}
                </span>
              </>
            }
            footer={
              <>
                <Button href={`/admin/services/${service.id}`} variant="secondary" size="md" className="px-3 py-1.5 text-xs">
                  Editar
                </Button>
                <ServiceActionButton serviceId={service.id} action={service.isPublished ? "unpublish" : "publish"} />
              </>
            }
          />
        ))}
      </div>
    </div>
  );
}
