import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getServiceById } from "@/lib/db/servicesStore";
import { BooleanStatusBadge } from "@/components/admin/BooleanStatusBadge";
import { ServiceActionButton } from "@/components/admin/ServiceActions";
import { ServiceForm } from "@/components/admin/ServiceForm";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ServiceDetailAdminPage({ params }: PageProps) {
  const { id } = await params;
  const service = await getServiceById(id);
  if (!service) notFound();

  return (
    <div>
      <Link href="/admin/services" className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Servicios
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{service.content.es.heading}</h1>
          <BooleanStatusBadge active={service.isPublished} activeLabel="Publicado" inactiveLabel="Oculto" />
        </div>
        <ServiceActionButton serviceId={service.id} action={service.isPublished ? "unpublish" : "publish"} />
      </div>

      {!service.isPublished && (
        <div className="mt-6 rounded-xl border border-border-strong bg-bg-raised p-4 shadow-soft">
          <p className="text-sm text-fg-muted">
            Este servicio está oculto — no aparece en /services ni en su ruta individual
            (/services/{service.slug} responde 404) hasta que se publique.
          </p>
        </div>
      )}

      <div className="mt-8">
        <ServiceForm mode="edit" serviceId={service.id} initialValues={service} />
      </div>
    </div>
  );
}
