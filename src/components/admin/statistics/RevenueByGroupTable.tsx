import Link from "next/link";
import { MoneyByCurrencyValue } from "@/components/admin/statistics/MoneyByCurrencyValue";
import type { RevenueByGroupEntry } from "@/lib/statistics/types";

/**
 * Fase 10 — reused for "ingresos por proyecto" and "ingresos por cliente".
 * `linkPrefix` (e.g. "/admin/clients/") makes each row a link into the
 * existing detail page instead of duplicating PII here — see
 * buildRevenueByClient()'s doc comment in aggregate.ts: label is a name at
 * most, never email/phone.
 */
export function RevenueByGroupTable({
  entries,
  emptyLabel,
  linkPrefix,
  maxRows = 8,
}: {
  entries: RevenueByGroupEntry[];
  emptyLabel: string;
  linkPrefix?: string;
  maxRows?: number;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg-raised p-6 text-center">
        <p className="text-sm text-fg-subtle">{emptyLabel}</p>
      </div>
    );
  }

  const shown = entries.slice(0, maxRows);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg-raised">
      <ul className="divide-y divide-border">
        {shown.map((entry) => {
          const row = (
            <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
              <span className="truncate text-sm text-fg">{entry.label}</span>
              <span className="shrink-0 text-sm font-medium text-fg">
                <MoneyByCurrencyValue byCurrency={entry.amountsByCurrency} />
              </span>
            </div>
          );
          return (
            <li key={entry.id} className="transition-colors hover:bg-bg-overlay">
              {linkPrefix ? (
                <Link href={`${linkPrefix}${entry.id}`} className="block hover:no-underline">
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
      {entries.length > maxRows && (
        <p className="border-t border-border px-4 py-2 text-xs text-fg-subtle sm:px-5">
          +{entries.length - maxRows} más
        </p>
      )}
    </div>
  );
}
