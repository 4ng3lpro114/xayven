import { PromotionForm } from "@/components/admin/PromotionForm";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";

export const dynamic = "force-dynamic";

export default function NewPromotionPage() {
  return (
    <div>
      <AdminPageHeader
        eyebrow="Comercial"
        title="Nueva promoción"
        description="Se crea como borrador — usa “Programar” desde la lista cuando esté lista para activarse según sus fechas."
      />
      <div className="mt-8">
        <PromotionForm mode="create" />
      </div>
    </div>
  );
}
