"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { PricingCatalogItem, PricingType } from "@/lib/pricing/types";
import type { PricingMarketPrice } from "@/lib/pricing/market/types";

const inputClasses =
  "rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-sm text-fg focus:border-accent-400 focus:outline-none disabled:opacity-50";

/**
 * International Pricing — Phase D Admin. One row per Pricing Core item,
 * each an independent mini-form for THIS market's official price — never
 * a second pricing table: every row writes to pricing_market_prices via
 * /api/admin/markets/[id]/prices (create) or
 * /api/admin/markets/[id]/prices/[priceId] (edit), the same store
 * resolveOfficialPrice() reads from. Currency is fixed to the market's
 * own currency (never a free field here — see
 * MarketCurrencyMismatchError's whole reason for existing).
 */
export function MarketPriceManager({
  marketId,
  marketCurrency,
  catalogItems,
  existingPrices,
}: {
  marketId: string;
  marketCurrency: string;
  catalogItems: PricingCatalogItem[];
  existingPrices: PricingMarketPrice[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b border-border py-2 pr-4 text-left font-medium text-fg-subtle">Producto</th>
            <th className="border-b border-border py-2 pr-4 text-left font-medium text-fg-subtle">Tipo</th>
            <th className="border-b border-border py-2 pr-4 text-left font-medium text-fg-subtle">
              Precio ({marketCurrency})
            </th>
            <th className="border-b border-border py-2 pr-4 text-left font-medium text-fg-subtle">Activo</th>
            <th className="border-b border-border py-2 text-left font-medium text-fg-subtle" />
          </tr>
        </thead>
        <tbody>
          {catalogItems.map((item) => (
            <MarketPriceRow
              key={item.id}
              marketId={marketId}
              marketCurrency={marketCurrency}
              item={item}
              existing={existingPrices.find((p) => p.pricingCatalogId === item.id) ?? null}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarketPriceRow({
  marketId,
  marketCurrency,
  item,
  existing,
}: {
  marketId: string;
  marketCurrency: string;
  item: PricingCatalogItem;
  existing: PricingMarketPrice | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const data = new FormData(e.currentTarget);
    const price = Number(data.get("price"));
    const priceType = String(data.get("priceType") ?? "FIXED") as PricingType;
    const isActive = data.get("isActive") === "on";

    try {
      const res = existing
        ? await fetch(`/api/admin/markets/${marketId}/prices/${existing.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ price, priceType, isActive }),
          })
        : await fetch(`/api/admin/markets/${marketId}/prices`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pricingCatalogId: item.id,
              marketId,
              currency: marketCurrency,
              priceType,
              price,
              isActive,
            }),
          });
      const result = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && result.ok) {
        router.refresh();
      } else {
        setError("No se pudo guardar. Revisa el precio e intenta de nuevo.");
      }
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <tr>
      <td className="border-b border-border py-2 pr-4">
        <span className="font-medium text-fg">{item.name}</span>
        <span className="ml-2 font-mono text-xs text-fg-subtle">{item.slug}</span>
      </td>
      <td className="border-b border-border py-2 pr-4">
        <form id={`price-form-${item.id}`} onSubmit={handleSubmit} className="contents">
          <select name="priceType" defaultValue={existing?.priceType ?? item.priceType} className={inputClasses}>
            <option value="FIXED">Fijo</option>
            <option value="FROM">Desde</option>
          </select>
        </form>
      </td>
      <td className="border-b border-border py-2 pr-4">
        <input
          form={`price-form-${item.id}`}
          name="price"
          type="number"
          min={1}
          step={1}
          placeholder="Sin definir"
          defaultValue={existing?.price}
          className={`${inputClasses} w-32`}
        />
      </td>
      <td className="border-b border-border py-2 pr-4">
        <input
          form={`price-form-${item.id}`}
          type="checkbox"
          name="isActive"
          defaultChecked={existing?.isActive ?? true}
          className="size-4 rounded border-border-strong"
        />
      </td>
      <td className="border-b border-border py-2">
        <button
          form={`price-form-${item.id}`}
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-border-accent hover:text-fg disabled:opacity-50"
        >
          {loading && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
          {existing ? "Actualizar" : "Definir precio"}
        </button>
        {error && <p className="mt-1 text-[0.7rem] text-error">{error}</p>}
      </td>
    </tr>
  );
}
