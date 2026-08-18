import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPricingMarketById, listMarketCountries, listPricingMarketPrices } from "@/lib/db/pricingMarketStore";
import { listPricingCatalogItems } from "@/lib/db/pricingCatalogStore";
import { BooleanStatusBadge } from "@/components/admin/BooleanStatusBadge";
import { MarketActionButton } from "@/components/admin/MarketActions";
import { MarketForm } from "@/components/admin/MarketForm";
import { MarketCountryManager } from "@/components/admin/MarketCountryManager";
import { MarketPriceManager } from "@/components/admin/MarketPriceManager";
import { AdminSection } from "@/components/admin/ui/AdminSection";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * International Pricing — Phase D Admin. One page for everything a market
 * needs: its own fields, country routing (market_countries), and its
 * official prices per Pricing Core item (pricing_market_prices) —
 * consolidated instead of three separate pages, since all three are
 * meaningless without the market they belong to. `listMarketCountries()`
 * is fetched in full and filtered client-side to this market — the table
 * is small (country routing is deliberately sparse, see Phase A's design
 * doc) so this never needs its own filtered query function.
 *
 * Admin UI Polish — the flat `<section><h2>` run is now three AdminSection
 * cards, so this reads as three distinct commercial facts about the
 * market instead of one continuous scroll. No field, no route, no
 * resolver logic touched.
 */
export default async function MarketDetailPage({ params }: PageProps) {
  const { id } = await params;
  const market = await getPricingMarketById(id);
  if (!market) notFound();

  const [allCountries, prices, catalogItems] = await Promise.all([
    listMarketCountries(),
    listPricingMarketPrices({ marketId: id }),
    listPricingCatalogItems({ activeOnly: true }),
  ]);
  const countryCodes = allCountries.filter((c) => c.marketId === id).map((c) => c.countryCode);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/markets" className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Mercados
        </Link>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">{market.name}</h1>
            <BooleanStatusBadge active={market.isActive} activeLabel="Activo" inactiveLabel="Inactivo" />
          </div>
          <MarketActionButton marketId={market.id} action={market.isActive ? "deactivate" : "activate"} />
        </div>

        {!market.isActive && (
          <div className="mt-4 rounded-lg border border-border-strong bg-bg-raised p-4">
            <p className="text-sm text-fg-muted">
              Este mercado está inactivo — resolveCommercialMarket() nunca lo usa vía cookie
              explícita ni geo-sugerencia mientras esté desactivado; los visitantes caen al
              siguiente nivel (geo → &apos;OTHER&apos;).
            </p>
          </div>
        )}
      </div>

      <AdminSection title="Datos del mercado">
        <MarketForm mode="edit" marketId={market.id} initialValues={market} />
      </AdminSection>

      <AdminSection
        title="Países enrutados a este mercado"
        description="Señal de enrutamiento, nunca la clave del precio — un país sin ruta cae a 'OTHER'. La selección explícita del visitante (cookie) siempre gana sobre esto."
      >
        <MarketCountryManager marketId={market.id} countryCodes={countryCodes} />
      </AdminSection>

      <AdminSection
        title={`Precios oficiales en este mercado (${market.currency})`}
        description="Un precio definido aquí siempre gana sobre la conversión dinámica. Sin precio propio, se aplica la política de fallback de este mercado."
      >
        <MarketPriceManager
          marketId={market.id}
          marketCurrency={market.currency}
          catalogItems={catalogItems}
          existingPrices={prices}
        />
      </AdminSection>
    </div>
  );
}
