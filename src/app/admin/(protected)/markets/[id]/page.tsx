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
    <div>
      <Link href="/admin/markets" className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Mercados
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-fg">{market.name}</h1>
          <BooleanStatusBadge active={market.isActive} activeLabel="Activo" inactiveLabel="Inactivo" />
        </div>
        <MarketActionButton marketId={market.id} action={market.isActive ? "deactivate" : "activate"} />
      </div>

      {!market.isActive && (
        <div className="mt-6 rounded-lg border border-border-strong bg-bg-raised p-4">
          <p className="text-sm text-fg-muted">
            Este mercado está inactivo — resolveCommercialMarket() nunca lo usa vía cookie
            explícita ni geo-sugerencia mientras esté desactivado; los visitantes caen al
            siguiente nivel (geo → &apos;OTHER&apos;).
          </p>
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-fg">Datos del mercado</h2>
        <div className="mt-4">
          <MarketForm mode="edit" marketId={market.id} initialValues={market} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold text-fg">Países enrutados a este mercado</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Señal de enrutamiento, nunca la clave del precio — un país sin ruta cae a
          &apos;OTHER&apos;. La selección explícita del visitante (cookie) siempre gana sobre
          esto.
        </p>
        <div className="mt-4">
          <MarketCountryManager marketId={market.id} countryCodes={countryCodes} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold text-fg">Precios oficiales en este mercado ({market.currency})</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Un precio definido aquí siempre gana sobre la conversión dinámica. Sin precio propio,
          se aplica la política de fallback de este mercado.
        </p>
        <div className="mt-4">
          <MarketPriceManager
            marketId={market.id}
            marketCurrency={market.currency}
            catalogItems={catalogItems}
            existingPrices={prices}
          />
        </div>
      </section>
    </div>
  );
}
