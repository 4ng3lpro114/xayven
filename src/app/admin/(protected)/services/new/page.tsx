import { ServiceForm } from "@/components/admin/ServiceForm";

export const dynamic = "force-dynamic";

export default function NewServicePage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-fg">Nuevo servicio</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Contenido completo en español e inglés — ambos son obligatorios, ningún servicio se
        publica con una traducción incompleta.
      </p>
      <div className="mt-8">
        <ServiceForm mode="create" />
      </div>
    </div>
  );
}
