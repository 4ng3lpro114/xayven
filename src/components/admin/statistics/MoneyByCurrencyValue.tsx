import { formatMoney } from "@/lib/payments/format";
import type { MoneyByCurrency } from "@/lib/statistics/types";

/**
 * Renders a MoneyByCurrency map — never sums across currencies (same rule
 * as src/lib/clients/summary.ts's PaidCell). Almost always a single
 * currency in practice today (COP), but stays correct the moment a second
 * one (e.g. USD via PayPal) appears.
 */
export function MoneyByCurrencyValue({
  byCurrency,
  fallback = "$0",
}: {
  byCurrency: MoneyByCurrency;
  fallback?: string;
}) {
  const entries = Object.entries(byCurrency);
  if (entries.length === 0) return <>{fallback}</>;
  if (entries.length === 1) return <>{formatMoney(entries[0]![1], entries[0]![0])}</>;
  return (
    <>
      {entries.map(([currency, amount]) => (
        <span key={currency} className="block">
          {formatMoney(amount, currency)}
        </span>
      ))}
    </>
  );
}
