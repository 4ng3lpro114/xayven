"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toLines, fromLines } from "@/lib/services/textLists";
import type { PricingCatalogItem, PricingCategory, PricingBillingInterval, PricingType } from "@/lib/pricing/types";

const inputClasses =
  "w-full rounded-md border border-border-strong bg-bg-elevated px-4 py-3 text-sm text-fg placeholder:text-fg-subtle focus:border-accent-400 focus:outline-none disabled:opacity-50";
const textareaClasses = `${inputClasses} font-mono text-xs`;

const CATEGORY_LABELS: Record<PricingCategory, string> = {
  package: "Paquete web",
  maintenance: "Plan de mantenimiento",
};

const BILLING_LABELS: Record<PricingBillingInterval, string> = {
  ONE_TIME: "Pago único",
  MONTHLY: "Mensual",
};

const PRICE_TYPE_LABELS: Record<PricingType, string> = {
  FIXED: "Precio fijo",
  FROM: "Desde (precio piso)",
};

export interface PackageFormValues {
  slug: string;
  name: string;
  category: PricingCategory;
  billingInterval: PricingBillingInterval;
  priceType: PricingType;
  basePrice: number;
  currency: string;
  isActive: boolean;
  features: { es: string[]; en: string[] };
}

/**
 * Admin Phase 5 — shared between /admin/packages/new and
 * /admin/packages/[id], mirroring PromotionForm.tsx's exact structure
 * (same inputClasses, same Field helper, same FormData-based submit, no
 * new form pattern introduced).
 *
 * `slug`/`category`/`billingInterval` are only editable on CREATE — on
 * edit they render disabled (visible, not submitted) since they define
 * what the item fundamentally is, not something a price/name edit
 * touches (see UpdatePricingCatalogItemInput's doc comment).
 *
 * Pre-Production Correction R1 — `features` (ES/EN) is the single
 * source of truth for what a MAINTENANCE plan includes, now editable
 * right here instead of only by code deploy. Shown only for
 * category="maintenance" (the 5 web packages don't use this field — a
 * service's own "includes" list already covers that, see
 * services/types.ts) — one-line-per-item textareas, same
 * toLines()/fromLines() convention ServiceForm.tsx already established,
 * reused as-is here rather than duplicated.
 */
export function PackageForm({
  mode,
  itemId,
  initialValues,
}: {
  mode: "create" | "edit";
  itemId?: string;
  initialValues?: PricingCatalogItem;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<PricingCategory>(initialValues?.category ?? "package");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const data = new FormData(e.currentTarget);

    const payload: PackageFormValues = {
      slug: String(data.get("slug") ?? "").trim(),
      name: String(data.get("name") ?? "").trim(),
      category: String(data.get("category") ?? "package") as PricingCategory,
      billingInterval: String(data.get("billingInterval") ?? "ONE_TIME") as PricingBillingInterval,
      priceType: String(data.get("priceType") ?? "FIXED") as PricingType,
      basePrice: Number(data.get("basePrice")),
      currency: String(data.get("currency") ?? "COP"),
      isActive: data.get("isActive") === "on",
      features: {
        es: fromLines(String(data.get("featuresEs") ?? "")),
        en: fromLines(String(data.get("featuresEn") ?? "")),
      },
    };

    const url = mode === "create" ? "/api/admin/packages" : `/api/admin/packages/${itemId}`;
    // Edit never sends slug/category/billingInterval — the API route's
    // schema excludes them entirely, this just avoids sending fields the
    // server will silently ignore anyway.
    const body =
      mode === "create"
        ? payload
        : {
            name: payload.name,
            priceType: payload.priceType,
            basePrice: payload.basePrice,
            currency: payload.currency,
            isActive: payload.isActive,
            features: payload.features,
          };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await res.json().catch(() => ({}))) as { ok?: boolean; itemId?: string; error?: string };

      if (res.ok && result.ok) {
        const id = mode === "create" ? result.itemId : itemId;
        router.push(`/admin/packages/${id}`);
        router.refresh();
        return;
      }

      if (result.error === "slug_conflict") {
        setError("Ya existe un producto con ese slug.");
      } else {
        setError("No pudimos guardar el producto. Revisa los datos e intenta de nuevo.");
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
        <Field label="Slug" htmlFor="slug">
          <input
            id="slug"
            name="slug"
            type="text"
            required
            disabled={mode === "edit"}
            defaultValue={initialValues?.slug}
            placeholder="start"
            pattern="[a-z0-9-]+"
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
            placeholder="START"
            className={inputClasses}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Categoría" htmlFor="category">
          <select
            id="category"
            name="category"
            disabled={mode === "edit"}
            defaultValue={category}
            onChange={(e) => setCategory(e.target.value as PricingCategory)}
            className={inputClasses}
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Intervalo de cobro" htmlFor="billingInterval">
          <select
            id="billingInterval"
            name="billingInterval"
            disabled={mode === "edit"}
            defaultValue={initialValues?.billingInterval ?? "ONE_TIME"}
            className={inputClasses}
          >
            {Object.entries(BILLING_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Tipo de precio" htmlFor="priceType">
          <select id="priceType" name="priceType" defaultValue={initialValues?.priceType ?? "FIXED"} className={inputClasses}>
            {Object.entries(PRICE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Precio base" htmlFor="basePrice">
          <input
            id="basePrice"
            name="basePrice"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={initialValues?.basePrice}
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
          name="isActive"
          defaultChecked={initialValues?.isActive ?? true}
          className="size-4 rounded border-border-strong"
        />
        Activo (visible públicamente en Services/Maintenance)
      </label>

      {category === "maintenance" && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Qué incluye — Español (una línea por ítem)" htmlFor="featuresEs">
            <textarea
              id="featuresEs"
              name="featuresEs"
              rows={5}
              defaultValue={initialValues ? toLines(initialValues.features.es) : ""}
              placeholder={"Actualizaciones técnicas y de seguridad\nMonitoreo de disponibilidad"}
              className={textareaClasses}
            />
          </Field>
          <Field label="Qué incluye — English (one item per line)" htmlFor="featuresEn">
            <textarea
              id="featuresEn"
              name="featuresEn"
              rows={5}
              defaultValue={initialValues ? toLines(initialValues.features.en) : ""}
              placeholder={"Technical and security updates\nUptime monitoring"}
              className={textareaClasses}
            />
          </Field>
        </div>
      )}

      {error && <p className="text-sm text-error">{error}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : mode === "create" ? (
          "Crear producto"
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
