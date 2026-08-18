"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { MarketFallbackBehavior, PricingMarket } from "@/lib/pricing/market/types";

const inputClasses =
  "w-full rounded-md border border-border-strong bg-bg-elevated px-4 py-3 text-sm text-fg placeholder:text-fg-subtle focus:border-accent-400 focus:outline-none disabled:opacity-50";

const FALLBACK_LABELS: Record<MarketFallbackBehavior, string> = {
  QUOTE_ONLY: "Solo cotización (no muestra ningún precio)",
  BASE_REFERENCE: "Referencia al precio base COP (nunca oficial para este mercado)",
};

export interface MarketFormValues {
  code: string;
  name: string;
  currency: string;
  conversionAllowed: boolean;
  fallbackBehavior: MarketFallbackBehavior;
  isActive: boolean;
}

/**
 * International Pricing — Phase D Admin. Mirrors PackageForm.tsx's exact
 * structure (same inputClasses, same Field helper, same FormData-based
 * submit). `code` is only editable on CREATE — identical discipline to
 * PackageForm's slug/category/billingInterval.
 */
export function MarketForm({
  mode,
  marketId,
  initialValues,
}: {
  mode: "create" | "edit";
  marketId?: string;
  initialValues?: PricingMarket;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const data = new FormData(e.currentTarget);

    const payload: MarketFormValues = {
      code: String(data.get("code") ?? "").trim(),
      name: String(data.get("name") ?? "").trim(),
      currency: String(data.get("currency") ?? "COP"),
      conversionAllowed: data.get("conversionAllowed") === "on",
      fallbackBehavior: String(data.get("fallbackBehavior") ?? "QUOTE_ONLY") as MarketFallbackBehavior,
      isActive: data.get("isActive") === "on",
    };

    const url = mode === "create" ? "/api/admin/markets" : `/api/admin/markets/${marketId}`;
    const body =
      mode === "create"
        ? payload
        : {
            name: payload.name,
            currency: payload.currency,
            conversionAllowed: payload.conversionAllowed,
            fallbackBehavior: payload.fallbackBehavior,
            isActive: payload.isActive,
          };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await res.json().catch(() => ({}))) as { ok?: boolean; marketId?: string; error?: string };

      if (res.ok && result.ok) {
        const id = mode === "create" ? result.marketId : marketId;
        router.push(`/admin/markets/${id}`);
        router.refresh();
        return;
      }

      if (result.error === "code_conflict") {
        setError("Ya existe un mercado con ese código.");
      } else {
        setError("No pudimos guardar el mercado. Revisa los datos e intenta de nuevo.");
      }
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Código" htmlFor="code">
          <input
            id="code"
            name="code"
            type="text"
            required
            disabled={mode === "edit"}
            defaultValue={initialValues?.code}
            placeholder="US"
            pattern="[A-Z0-9_-]+"
            className={inputClasses}
          />
        </Field>
        <Field label="Nombre" htmlFor="name">
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={initialValues?.name}
            placeholder="United States"
            className={inputClasses}
          />
        </Field>
      </div>

      <Field label="Moneda" htmlFor="currency">
        <select id="currency" name="currency" defaultValue={initialValues?.currency ?? "COP"} className={inputClasses}>
          <option value="COP">COP</option>
          <option value="USD">USD</option>
        </select>
      </Field>

      <label className="flex items-center gap-2.5 text-sm text-fg">
        <input
          type="checkbox"
          name="conversionAllowed"
          defaultChecked={initialValues?.conversionAllowed ?? false}
          className="size-4 rounded border-border-strong"
        />
        Permitir conversión dinámica cuando no exista un precio propio para este mercado (Phase C)
      </label>

      <Field label="Política de fallback (sin precio propio ni conversión disponible)" htmlFor="fallbackBehavior">
        <select
          id="fallbackBehavior"
          name="fallbackBehavior"
          defaultValue={initialValues?.fallbackBehavior ?? "QUOTE_ONLY"}
          className={inputClasses}
        >
          {Object.entries(FALLBACK_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <label className="flex items-center gap-2.5 text-sm text-fg">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={initialValues?.isActive ?? true}
          className="size-4 rounded border-border-strong"
        />
        Activo (visitantes pueden resolver a este mercado)
      </label>

      {error && <p className="text-sm text-error">{error}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : mode === "create" ? (
          "Crear mercado"
        ) : (
          "Guardar cambios"
        )}
      </Button>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-fg">
        {label}
      </label>
      {children}
    </div>
  );
}
