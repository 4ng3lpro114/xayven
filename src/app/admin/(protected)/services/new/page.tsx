import { ServiceForm } from "@/components/admin/ServiceForm";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";

export const dynamic = "force-dynamic";

export default function NewServicePage() {
  return (
    <div>
      <AdminPageHeader
        eyebrow="Catálogo"
        title="Nuevo servicio"
        description="Contenido completo en español e inglés — ambos son obligatorios, ningún servicio se publica con una traducción incompleta."
      />
      <div className="mt-8">
        <ServiceForm mode="create" />
      </div>
    </div>
  );
}
