import { Plus, Globe2 } from "lucide-react";
import { listPricingMarkets } from "@/lib/db/pricingMarketStore";
import { BooleanStatusBadge } from "@/components/admin/BooleanStatusBadge";
import { MarketActionButton } from "@/components/admin/MarketActions";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEntityCard } from "@/components/admin/ui/AdminEntityCard";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

/**
 * International Pricing — Phase D Admin. /admin/markets — same bulk-fetch
 * + list pattern as /admin/packages. `pricing_markets` is the only table
 * this reads for the list — country routing and per-item prices are
 * managed on each market's own detail page, never duplicated here.
 *
 * Admin UI Polish — restyled onto AdminPageHeader/AdminEntityCard, the
 * same shared list-card /admin/packages and /admin/services now use.
 */
export default async function AdminMarketsPage() {
  const markets = await listPricingMarkets();

  return (
    <div>
      <AdminPageHeader
        eyebrow="International Pricing"
        title="Mercados"
        description="El mercado determina el precio comercial — currency es solo su atributo. Pricing Core sigue siendo la única fuente de verdad."
        action={
          <Button href="/admin/markets/new" size="md">
            <Plus className="size-4" aria-hidden="true" />
            Nuevo mercado
          </Button>
        }
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {markets.length === 0 && (
          <AdminEmptyState
            icon={Globe2}
            title="No hay mercados todavía"
            description="Todos los visitantes resuelven a 'OTHER' hasta que crees el primer mercado."
          />
        )}
        {markets.map((market) => (
          <AdminEntityCard
            key={market.id}
            href={`/admin/markets/${market.id}`}
            title={market.name}
            badge={<BooleanStatusBadge active={market.isActive} activeLabel="Activo" inactiveLabel="Inactivo" />}
            meta={`${market.code} · ${market.currency}`}
            description={
              <>
                {market.conversionAllowed ? "Conversión dinámica permitida" : "Sin conversión dinámica"}
                <br />
                Fallback: {market.fallbackBehavior === "QUOTE_ONLY" ? "Solo cotización" : "Referencia base COP"}
              </>
            }
            footer={
              <>
                <Button href={`/admin/markets/${market.id}`} variant="secondary" size="md" className="px-3 py-1.5 text-xs">
                  Gestionar
                </Button>
                <MarketActionButton marketId={market.id} action={market.isActive ? "deactivate" : "activate"} />
              </>
            }
          />
        ))}
      </div>
    </div>
  );
}
