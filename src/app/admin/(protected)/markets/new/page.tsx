import { MarketForm } from "@/components/admin/MarketForm";

export const dynamic = "force-dynamic";

export default function NewMarketPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-fg">Nuevo mercado</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Un mercado es una zona comercial de XAYVEN — no un país ni una moneda por sí sola. Dos
        mercados pueden compartir moneda con precios oficiales distintos.
      </p>
      <div className="mt-8">
        <MarketForm mode="create" />
      </div>
    </div>
  );
}
