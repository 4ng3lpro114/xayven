"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AdminFormSection, AdminField, AdminCheckboxField, adminInputClasses } from "@/components/admin/ui/AdminFormSection";
import type { MarketFallbackBehavior, PricingMarket } from "@/lib/pricing/market/types";

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
 * structure (same FormData-based submit). `code` is only editable on
 * CREATE — identical discipline to PackageForm's slug/category/
 * billingInterval.
 *
 * Admin UI Polish — grouped into AdminFormSection blocks (Identificación /
 * Política comercial / Estado) instead of a flat label-input run. Field
 * names, submit payload, and validation are byte-for-byte the same.
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
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      <AdminFormSection title="Identificación">
        <div className="grid gap-5 sm:grid-cols-2">
          <AdminField label="Código" htmlFor="code">
            <input
              id="code"
              name="code"
              type="text"
              required
              disabled={mode === "edit"}
              defaultValue={initialValues?.code}
              placeholder="US"
              pattern="[A-Z0-9_-]+"
              className={adminInputClasses}
            />
          </AdminField>
          <AdminField label="Nombre" htmlFor="name">
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={initialValues?.name}
              placeholder="United States"
              className={adminInputClasses}
            />
          </AdminField>
        </div>
        <AdminField label="Moneda" htmlFor="currency">
          <select id="currency" name="currency" defaultValue={initialValues?.currency ?? "COP"} className={adminInputClasses}>
            <option value="COP">COP</option>
            <option value="USD">USD</option>
          </select>
        </AdminField>
      </AdminFormSection>

      <AdminFormSection
        title="Política comercial"
        description="Decide qué precio se muestra cuando este mercado no tiene un precio oficial propio."
      >
        <AdminCheckboxField name="conversionAllowed" defaultChecked={initialValues?.conversionAllowed ?? false}>
          Permitir conversión dinámica cuando no exista un precio propio para este mercado (Phase C)
        </AdminCheckboxField>

        <AdminField label="Política de fallback (sin precio propio ni conversión disponible)" htmlFor="fallbackBehavior">
          <select
            id="fallbackBehavior"
            name="fallbackBehavior"
            defaultValue={initialValues?.fallbackBehavior ?? "QUOTE_ONLY"}
            className={adminInputClasses}
          >
            {Object.entries(FALLBACK_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </AdminField>
      </AdminFormSection>

      <AdminFormSection title="Estado">
        <AdminCheckboxField name="isActive" defaultChecked={initialValues?.isActive ?? true}>
          Activo (visitantes pueden resolver a este mercado)
        </AdminCheckboxField>
      </AdminFormSection>

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
