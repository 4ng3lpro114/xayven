import Link from "next/link";
import { Plus } from "lucide-react";
import { listPricingMarkets } from "@/lib/db/pricingMarketStore";
import { BooleanStatusBadge } from "@/components/admin/BooleanStatusBadge";
import { MarketActionButton } from "@/components/admin/MarketActions";

export const dynamic = "force-dynamic";

/**
 * International Pricing — Phase D Admin. /admin/markets — same bulk-fetch
 * + list pattern as /admin/packages. `pricing_markets` is the only table
 * this reads for the list — country routing and per-item prices are
 * managed on each market's own detail page, never duplicated here.
 */
export default async function AdminMarketsPage() {
  const markets = await listPricingMarkets();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-fg">Mercados</h1>
          <p className="mt-1 text-sm text-fg-muted">
            International Pricing — Market determina el precio comercial; currency es solo su
            atributo. Pricing Core sigue siendo la única fuente de verdad.
          </p>
        </div>
        <Link
          href="/admin/markets/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-400"
        >
          <Plus className="size-4" aria-hidden="true" />
          Nuevo mercado
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {markets.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-fg-subtle">
            No hay mercados todavía — todos los visitantes resuelven a &apos;OTHER&apos;.
          </p>
        )}
        {markets.map((market) => (
          <div key={market.id} className="rounded-lg border border-border bg-bg-raised p-5">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/admin/markets/${market.id}`} className="text-sm font-semibold text-fg hover:text-accent-300">
                {market.name}
              </Link>
              <BooleanStatusBadge active={market.isActive} activeLabel="Activo" inactiveLabel="Inactivo" />
            </div>

            <p className="mt-2 font-mono text-xs uppercase tracking-[0.1em] text-fg-subtle">
              {market.code} · {market.currency}
            </p>

            <p className="mt-3 text-xs text-fg-muted">
              {market.conversionAllowed ? "Conversión dinámica permitida" : "Sin conversión dinámica"} · Fallback:{" "}
              {market.fallbackBehavior === "QUOTE_ONLY" ? "Solo cotización" : "Referencia base COP"}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/admin/markets/${market.id}`}
                className="inline-flex items-center rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-border-accent hover:text-fg"
              >
                Gestionar
              </Link>
              <MarketActionButton marketId={market.id} action={market.isActive ? "deactivate" : "activate"} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
