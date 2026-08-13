import { PromotionForm } from "@/components/admin/PromotionForm";

export const dynamic = "force-dynamic";

export default function NewPromotionPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-fg">Nueva promoción</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Se crea como borrador — usa &quot;Programar&quot; desde la lista cuando esté lista para
        activarse según sus fechas.
      </p>
      <div className="mt-8">
        <PromotionForm mode="create" />
      </div>
    </div>
  );
}
