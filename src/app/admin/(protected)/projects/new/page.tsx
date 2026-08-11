import { NewProjectForm } from "@/components/admin/NewProjectForm";

export default function NewProjectPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-fg">Nuevo proyecto</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Crea el cliente y el proyecto. Se genera automáticamente un enlace privado de
        seguimiento (área del cliente) que podrás copiar en la página del proyecto.
      </p>
      <div className="mt-8">
        <NewProjectForm />
      </div>
    </div>
  );
}
