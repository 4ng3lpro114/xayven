"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import type { PricingCatalogItem, PricingType } from "@/lib/pricing/types";
import type { PricingMarketPrice } from "@/lib/pricing/market/types";

const inputClasses =
  "rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-sm text-fg focus:border-accent-400 focus:outline-none disabled:opacity-50";

const PRICE_TYPE_OPTIONS = [
  { value: "FIXED", label: "Fijo" },
  { value: "FROM", label: "Desde" },
];

/**
 * International Pricing — Phase D Admin. One row per Pricing Core item,
 * each an independent mini-form for THIS market's official price — never
 * a second pricing table: every row writes to pricing_market_prices via
 * /api/admin/markets/[id]/prices (create) or
 * /api/admin/markets/[id]/prices/[priceId] (edit), the same store
 * resolveOfficialPrice() reads from. Currency is fixed to the market's
 * own currency (never a free field here — see
 * MarketCurrencyMismatchError's whole reason for existing).
 *
 * Admin UI Polish — this used to be a literal `<table>` (the single
 * clearest "Excel" moment in the whole Admin per the audit). Same data,
 * same 3 inputs + submit per item, same API calls — now a list of
 * responsive grid rows inside one rounded container instead of table
 * chrome, so it survives mobile without a forced horizontal scroll.
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
    <div>
      <div className="hidden grid-cols-[1fr_7rem_9rem_4.5rem_8rem] gap-3 border-b border-border pb-2 text-xs font-medium text-fg-subtle sm:grid">
        <span>Producto</span>
        <span>Tipo</span>
        <span>Precio ({marketCurrency})</span>
        <span>Activo</span>
        <span />
      </div>
      <div className="divide-y divide-border">
        {catalogItems.map((item) => (
          <MarketPriceRow
            key={item.id}
            marketId={marketId}
            marketCurrency={marketCurrency}
            item={item}
            existing={existingPrices.find((p) => p.pricingCatalogId === item.id) ?? null}
          />
        ))}
      </div>
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
  const formId = `price-form-${item.id}`;

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
    <div className="grid grid-cols-2 items-center gap-3 py-3 sm:grid-cols-[1fr_7rem_9rem_4.5rem_8rem]">
      <div className="col-span-2 sm:col-span-1">
        <span className="font-medium text-fg">{item.name}</span>
        <span className="ml-2 font-mono text-xs text-fg-subtle">{item.slug}</span>
      </div>

      <form id={formId} onSubmit={handleSubmit} className="contents">
        {/* XAYVEN CORE Phase 3.5 (Admin UI consistency) — CustomSelect.tsx
         *  instead of a native <select>; `className` shrinks its default
         *  padding (px-4 py-3) to match this row's denser `inputClasses`
         *  (px-3 py-2) so it still fits the fixed 7rem grid column. Its own
         *  single root <div> still ends up as this `display:contents`
         *  form's only child, so the grid layout is unaffected — same
         *  `name="priceType"`, same defaultValue, same FormData contract. */}
        <CustomSelect
          id={`${formId}-priceType`}
          name="priceType"
          options={PRICE_TYPE_OPTIONS}
          defaultValue={existing?.priceType ?? item.priceType}
          placeholder="—"
          className="px-3 py-2"
        />
      </form>

      <input
        form={formId}
        name="price"
        type="number"
        min={1}
        step={1}
        placeholder="Sin definir"
        defaultValue={existing?.price}
        className={`${inputClasses} w-full`}
      />

      <label className="flex items-center gap-2 text-xs text-fg-muted sm:justify-center">
        <input
          form={formId}
          type="checkbox"
          name="isActive"
          defaultChecked={existing?.isActive ?? true}
          className="size-4 rounded border-border-strong"
        />
        <span className="sm:hidden">Activo</span>
      </label>

      <div>
        <button
          form={formId}
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-border-accent hover:text-fg disabled:opacity-50"
        >
          {loading && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
          {existing ? "Actualizar" : "Definir precio"}
        </button>
        {error && <p className="mt-1 text-[0.7rem] text-error">{error}</p>}
      </div>
    </div>
  );
}
