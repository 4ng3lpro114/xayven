import { MarketForm } from "@/components/admin/MarketForm";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";

export const dynamic = "force-dynamic";

export default function NewMarketPage() {
  return (
    <div>
      <AdminPageHeader
        eyebrow="International Pricing"
        title="Nuevo mercado"
        description="Un mercado es una zona comercial de XAYVEN — no un país ni una moneda por sí sola. Dos mercados pueden compartir moneda con precios oficiales distintos."
      />
      <div className="mt-8">
        <MarketForm mode="create" />
      </div>
    </div>
  );
}
