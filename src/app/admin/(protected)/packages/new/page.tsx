import { PackageForm } from "@/components/admin/PackageForm";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";

export const dynamic = "force-dynamic";

export default function NewPackagePage() {
  return (
    <div>
      <AdminPageHeader
        eyebrow="Pricing Core"
        title="Nuevo producto"
        description="Un paquete web (pago único) o un plan de mantenimiento (mensual) — ambos viven en el mismo catálogo (Pricing Core)."
      />
      <div className="mt-8">
        <PackageForm mode="create" />
      </div>
    </div>
  );
}
