import { PackageForm } from "@/components/admin/PackageForm";

export const dynamic = "force-dynamic";

export default function NewPackagePage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-fg">Nuevo producto</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Un paquete web (pago único) o un plan de mantenimiento (mensual) — ambos viven en el
        mismo catálogo (Pricing Core).
      </p>
      <div className="mt-8">
        <PackageForm mode="create" />
      </div>
    </div>
  );
}
