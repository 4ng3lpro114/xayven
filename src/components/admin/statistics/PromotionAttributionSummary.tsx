import Link from "next/link";
import { Megaphone } from "lucide-react";
import { StatCard } from "@/components/admin/statistics/StatCard";
import type { PromotionAttributionStats } from "@/lib/statistics/types";

/**
 * Fase 11 Etapa A — minimal Analytics V2 integration, "Promoción →
 * Conversación" only (see buildPromotionAttributionStats() in
 * aggregate.ts). Same table shape as RevenueByGroupTable, just counting
 * conversations instead of money — not reused directly because that
 * component is money-typed (MoneyByCurrencyValue), and forcing this
 * integer count through it would be a worse fit than this small sibling.
 *
 * Explicitly NOT here (Etapa B, not this phase): revenue per promotion,
 * conversion rate per promotion, Promoción → Proyecto — `projects` has no
 * `promotion_id` yet, so none of that is computable today.
 */
export function PromotionAttributionSummary({ stats }: { stats: PromotionAttributionStats }) {
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Conversaciones desde una promoción"
          value={stats.totalAttributedConversations}
          caption="Todo el tiempo"
          accent
        />
      </div>

      <h3 className="mt-8 text-sm font-semibold text-fg">Por promoción</h3>
      <p className="mt-1 max-w-2xl text-xs text-fg-subtle">
        Solo cuenta conversaciones — ingresos y tasa de conversión por promoción todavía no
        existen (Etapa B, atribución a proyectos, no implementada).
      </p>
      <div className="mt-3">
        {stats.entries.length === 0 ? (
          <div className="rounded-lg border border-border bg-bg-raised p-6 text-center">
            <Megaphone className="mx-auto size-5 text-fg-subtle" aria-hidden="true" />
            <p className="mt-2 text-sm text-fg-subtle">
              Ninguna conversación se ha originado desde una promoción todavía.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-bg-raised">
            <ul className="divide-y divide-border">
              {stats.entries.map((entry) => (
                <li key={entry.promotionId} className="transition-colors hover:bg-bg-overlay">
                  <Link
                    href={`/admin/promotions/${entry.promotionId}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:no-underline sm:px-5"
                  >
                    <span className="truncate text-sm text-fg">{entry.label}</span>
                    <span className="shrink-0 text-sm font-medium text-fg">
                      {entry.conversationsCount}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
