"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { AdminFormSection, AdminField, adminInputClasses } from "@/components/admin/ui/AdminFormSection";
import type { Promotion, PromotionAudience, PromotionDiscountType } from "@/lib/promotions/types";

const inputClasses = adminInputClasses;
const CURRENCY_OPTIONS = ["COP", "USD"];

const AUDIENCE_LABELS: Record<PromotionAudience, string> = {
  new_users: "Usuarios nuevos",
  existing_clients: "Clientes existentes",
  all: "Todos",
};

const DISCOUNT_TYPE_LABELS: Record<PromotionDiscountType, string> = {
  percentage: "Porcentaje",
  fixed_amount: "Monto fijo",
  special_price: "Precio especial",
};

/** ISO string → the local "YYYY-MM-DDTHH:mm" shape <input type="datetime-local">
 *  expects — only used to pre-fill the edit form; new values always go back
 *  out as a real ISO string via `new Date(value).toISOString()`. */
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface PromotionFormValues {
  name: string;
  text: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  currency: string | null;
  startAt: string;
  endAt: string;
  audience: PromotionAudience;
  ctaLabel: string;
  ctaMessage: string | null;
}

/**
 * Fase 11B — shared between /admin/promotions/new and
 * /admin/promotions/[id], mirroring NewProjectForm.tsx's exact
 * structure/styling (same inputClasses, same Field helper, same
 * loading/error state shape) — no new form pattern introduced.
 *
 * XAYVEN CORE Phase 3.5 (Admin UI consistency) — discountType/currency/
 * audience now render via CustomSelect.tsx instead of a native `<select>`.
 * discountType's `onValueChange` replaces its old `onChange` 1:1 — same
 * `setDiscountType` call, same conditional Moneda field, same submitted
 * values. Visual only.
 */
export function PromotionForm({
  mode,
  promotionId,
  initialValues,
}: {
  mode: "create" | "edit";
  promotionId?: string;
  initialValues?: Promotion;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<PromotionDiscountType>(
    initialValues?.discountType ?? "percentage"
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const data = new FormData(e.currentTarget);
    const currentDiscountType = String(data.get("discountType")) as PromotionDiscountType;
    const rawCurrency = String(data.get("currency") ?? "");

    const payload: PromotionFormValues = {
      name: String(data.get("name") ?? ""),
      text: String(data.get("text") ?? ""),
      discountType: currentDiscountType,
      discountValue: Number(data.get("discountValue")),
      currency: currentDiscountType === "percentage" ? null : rawCurrency || null,
      startAt: new Date(String(data.get("startAt"))).toISOString(),
      endAt: new Date(String(data.get("endAt"))).toISOString(),
      audience: String(data.get("audience")) as PromotionAudience,
      ctaLabel: String(data.get("ctaLabel") ?? ""),
      // Empty textarea → null, never an empty string — matches the "no
      // message" case the store/types treat as the real absence of a
      // value (same normalization already applied to `currency` above).
      ctaMessage: String(data.get("ctaMessage") ?? "").trim() || null,
    };

    const url = mode === "create" ? "/api/admin/promotions" : `/api/admin/promotions/${promotionId}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        promotionId?: string;
        error?: string;
      };

      if (res.ok && result.ok) {
        const id = mode === "create" ? result.promotionId : promotionId;
        router.push(`/admin/promotions/${id}`);
        router.refresh();
        return;
      }

      if (result.error === "archived_read_only") {
        setError("Esta promoción está archivada y ya no se puede editar.");
      } else {
        setError("No pudimos guardar la promoción. Revisa los datos e intenta de nuevo.");
      }
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5">
      <AdminFormSection title="Contenido">
        <AdminField label="Nombre" htmlFor="name">
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={initialValues?.name}
            placeholder="Promoción de agosto"
            className={inputClasses}
          />
        </AdminField>

        <AdminField label="Texto visible" htmlFor="text">
          <textarea
            id="text"
            name="text"
            required
            rows={3}
            defaultValue={initialValues?.text}
            placeholder="🔥 ¡20% de descuento durante agosto!"
            className={inputClasses}
          />
        </AdminField>
      </AdminFormSection>

      <AdminFormSection title="Descuento">
        <div className="grid gap-5 sm:grid-cols-2">
          <AdminField label="Tipo de descuento" htmlFor="discountType">
            <CustomSelect
              id="discountType"
              name="discountType"
              options={Object.entries(DISCOUNT_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
              defaultValue={discountType}
              onValueChange={(v) => setDiscountType(v as PromotionDiscountType)}
              placeholder="—"
            />
          </AdminField>
          <AdminField label={discountType === "percentage" ? "Porcentaje" : "Valor"} htmlFor="discountValue">
            <input
              id="discountValue"
              name="discountValue"
              type="number"
              min={1}
              max={discountType === "percentage" ? 100 : undefined}
              step={discountType === "percentage" ? 1 : 1000}
              required
              defaultValue={initialValues?.discountValue}
              className={inputClasses}
            />
          </AdminField>
        </div>

        {discountType !== "percentage" && (
          <AdminField label="Moneda" htmlFor="currency">
            <CustomSelect
              id="currency"
              name="currency"
              options={CURRENCY_OPTIONS}
              defaultValue={initialValues?.currency ?? "COP"}
              placeholder="—"
            />
          </AdminField>
        )}
      </AdminFormSection>

      <AdminFormSection title="Vigencia y audiencia">
        <div className="grid gap-5 sm:grid-cols-2">
          <AdminField label="Fecha inicio" htmlFor="startAt">
            <input
              id="startAt"
              name="startAt"
              type="datetime-local"
              required
              defaultValue={initialValues ? toDatetimeLocalValue(initialValues.startAt) : undefined}
              className={inputClasses}
            />
          </AdminField>
          <AdminField label="Fecha final" htmlFor="endAt">
            <input
              id="endAt"
              name="endAt"
              type="datetime-local"
              required
              defaultValue={initialValues ? toDatetimeLocalValue(initialValues.endAt) : undefined}
              className={inputClasses}
            />
          </AdminField>
        </div>

        <AdminField label="Audiencia" htmlFor="audience">
          <CustomSelect
            id="audience"
            name="audience"
            options={Object.entries(AUDIENCE_LABELS).map(([value, label]) => ({ value, label }))}
            defaultValue={initialValues?.audience ?? "all"}
            placeholder="—"
          />
        </AdminField>
      </AdminFormSection>

      <AdminFormSection title="CTA">
        <AdminField label="Texto del CTA" htmlFor="ctaLabel">
          <input
            id="ctaLabel"
            name="ctaLabel"
            type="text"
            required
            defaultValue={initialValues?.ctaLabel}
            placeholder="Quiero aprovecharla"
            className={inputClasses}
          />
        </AdminField>

        <AdminField label="Mensaje del CTA (opcional)" htmlFor="ctaMessage">
          <textarea
            id="ctaMessage"
            name="ctaMessage"
            rows={2}
            defaultValue={initialValues?.ctaMessage ?? ""}
            placeholder="Hola, quiero aprovechar la promoción de agosto del 20%."
            className={inputClasses}
          />
          <p className="mt-1.5 text-xs text-fg-subtle">
            Reservado para cuando el botón abra XAYVEN AI con este mensaje — todavía no está
            conectado.
          </p>
        </AdminField>
      </AdminFormSection>

      {error && <p className="text-sm text-error">{error}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : mode === "create" ? (
          "Crear promoción"
        ) : (
          "Guardar cambios"
        )}
      </Button>
    </form>
  );
}
