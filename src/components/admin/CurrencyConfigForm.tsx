"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { CurrencyConfig } from "@/lib/pricing/currency/types";

const inputClasses =
  "w-full rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-sm text-fg focus:border-accent-400 focus:outline-none disabled:opacity-50";

/**
 * International Pricing — Phase D Admin. One row per currency —
 * currency_config is keyed by `currency` itself (see
 * currencyConfigStore.ts's setCurrencyConfig() doc comment), so this is a
 * single create-or-replace form per row, not a separate create/edit flow.
 *
 * Admin UI Polish — was a literal `<tr>` inside a `<table>` for a set of
 * exactly 2 currencies today — a table is the wrong shape for "a couple
 * of named configuration records", per the audit's own "cards when an
 * entity needs context" principle. Same fields, same single POST to
 * /api/admin/currency-config, now one card per currency.
 */
export function CurrencyConfigForm({ config }: { config: CurrencyConfig }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const data = new FormData(e.currentTarget);
    const roundingUnit = Number(data.get("roundingUnit"));
    const decimalPlaces = Number(data.get("decimalPlaces"));

    try {
      const res = await fetch("/api/admin/currency-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: config.currency, roundingUnit, decimalPlaces }),
      });
      const result = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && result.ok) {
        router.refresh();
      } else {
        setError("No se pudo guardar. Revisa los valores.");
      }
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-border bg-bg-raised p-6 shadow-soft sm:flex-row sm:items-end"
    >
      <div className="flex items-center gap-2.5 sm:w-28">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-500/10 font-mono text-xs font-semibold text-accent-300">
          {config.currency}
        </span>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-4">
        <div>
          <label htmlFor={`roundingUnit-${config.currency}`} className="mb-1.5 block text-xs font-medium text-fg-muted">
            Unidad de redondeo
          </label>
          <input
            id={`roundingUnit-${config.currency}`}
            name="roundingUnit"
            type="number"
            min={1}
            step={1}
            defaultValue={config.roundingUnit}
            required
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor={`decimalPlaces-${config.currency}`} className="mb-1.5 block text-xs font-medium text-fg-muted">
            Decimales
          </label>
          <input
            id={`decimalPlaces-${config.currency}`}
            name="decimalPlaces"
            type="number"
            min={0}
            step={1}
            defaultValue={config.decimalPlaces}
            required
            className={inputClasses}
          />
        </div>
      </div>

      <div className="sm:shrink-0">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:border-border-accent hover:text-fg disabled:opacity-50 sm:w-auto"
        >
          {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          Guardar
        </button>
        {error && <p className="mt-1.5 text-xs text-error">{error}</p>}
      </div>
    </form>
  );
}
