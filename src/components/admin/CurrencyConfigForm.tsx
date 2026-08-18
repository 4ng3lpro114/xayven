"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { CurrencyConfig } from "@/lib/pricing/currency/types";

const inputClasses =
  "w-24 rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-sm text-fg focus:border-accent-400 focus:outline-none disabled:opacity-50";

/**
 * International Pricing — Phase D Admin. One row per currency —
 * currency_config is keyed by `currency` itself (see
 * currencyConfigStore.ts's setCurrencyConfig() doc comment), so this is a
 * single create-or-replace form per row, not a separate create/edit flow.
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
    <tr>
      <td className="border-b border-border py-3 pr-4 font-mono text-sm font-medium text-fg">{config.currency}</td>
      <td className="border-b border-border py-3 pr-4">
        <form id={`currency-form-${config.currency}`} onSubmit={handleSubmit} className="contents">
          <input
            name="roundingUnit"
            type="number"
            min={1}
            step={1}
            defaultValue={config.roundingUnit}
            required
            className={inputClasses}
          />
        </form>
      </td>
      <td className="border-b border-border py-3 pr-4">
        <input
          form={`currency-form-${config.currency}`}
          name="decimalPlaces"
          type="number"
          min={0}
          step={1}
          defaultValue={config.decimalPlaces}
          required
          className={inputClasses}
        />
      </td>
      <td className="border-b border-border py-3">
        <button
          form={`currency-form-${config.currency}`}
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-border-accent hover:text-fg disabled:opacity-50"
        >
          {loading && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
          Guardar
        </button>
        {error && <p className="mt-1 text-[0.7rem] text-error">{error}</p>}
      </td>
    </tr>
  );
}
