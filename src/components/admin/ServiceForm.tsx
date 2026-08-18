"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toLines, fromLines, toFaqText, parseFaqText } from "@/lib/services/textLists";
import { AdminFormSection, AdminField, AdminCheckboxField, adminInputClasses } from "@/components/admin/ui/AdminFormSection";
import type { Service, ServiceContent } from "@/lib/services/types";
import type { Locale } from "@/lib/i18n/config";

const inputClasses = adminInputClasses;
const textareaClasses = `${inputClasses} font-mono text-xs`;

const LOCALES: Locale[] = ["es", "en"];
const LOCALE_LABELS: Record<Locale, string> = { es: "Español", en: "English" };

const FAQ_FORMAT_HINT =
  'Formato: "Q: pregunta" en una línea, "A: respuesta" en la siguiente, una línea en blanco entre cada par. Un bloque sin ambas líneas se rechaza al guardar — nunca desaparece en silencio.';

/**
 * Admin Phase 5 — shared between /admin/services/new and
 * /admin/services/[id]. List-shaped content fields (problem/includes/
 * forWhom/useCases/faq) render as one-item-per-line textareas via
 * lib/services/textLists.ts — see that file's doc comment for why.
 * `slug` is only editable on create (see UpdateServiceInput's doc
 * comment in services/types.ts).
 *
 * Pre-Production Correction R2 — FAQ blocks are validated BEFORE
 * submitting (parseFaqText()'s `invalidBlocks`), per locale. Any
 * malformed block blocks the entire save (never partially saves,
 * never silently drops the bad block) and is shown back to the admin
 * verbatim, next to a permanent format hint — same textarea-based
 * architecture as before, no CMS, no dynamic array widget added.
 */
export function ServiceForm({
  mode,
  serviceId,
  initialValues,
}: {
  mode: "create" | "edit";
  serviceId?: string;
  initialValues?: Service;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faqErrors, setFaqErrors] = useState<Record<Locale, string[]>>({ es: [], en: [] });

  function readContent(data: FormData, locale: Locale): ServiceContent {
    const prefix = `content.${locale}.`;
    return {
      heading: String(data.get(`${prefix}heading`) ?? "").trim(),
      tagline: String(data.get(`${prefix}tagline`) ?? "").trim(),
      definition: String(data.get(`${prefix}definition`) ?? "").trim(),
      problem: fromLines(String(data.get(`${prefix}problem`) ?? "")),
      solution: String(data.get(`${prefix}solution`) ?? "").trim(),
      includes: fromLines(String(data.get(`${prefix}includes`) ?? "")),
      forWhom: {
        idealIf: fromLines(String(data.get(`${prefix}idealIf`) ?? "")),
        notIdealIf: fromLines(String(data.get(`${prefix}notIdealIf`) ?? "")),
      },
      useCases: fromLines(String(data.get(`${prefix}useCases`) ?? "")),
      faq: parseFaqText(String(data.get(`${prefix}faq`) ?? "")).items,
    };
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const data = new FormData(e.currentTarget);

    // Pre-Production Correction R2 — validate FAQ format BEFORE anything
    // is submitted. A malformed block (missing "Q:" or "A:") must never
    // silently vanish — block the entire save and show the admin exactly
    // which block(s) failed, in which locale, so they consciously fix or
    // delete it instead of losing it without knowing.
    const newFaqErrors: Record<Locale, string[]> = { es: [], en: [] };
    let hasFaqErrors = false;
    for (const locale of LOCALES) {
      const raw = String(data.get(`content.${locale}.faq`) ?? "");
      const { invalidBlocks } = parseFaqText(raw);
      if (invalidBlocks.length > 0) {
        newFaqErrors[locale] = invalidBlocks;
        hasFaqErrors = true;
      }
    }
    setFaqErrors(newFaqErrors);
    if (hasFaqErrors) {
      setError("Hay bloques de FAQ con formato incorrecto — revisa los detalles bajo cada campo de FAQ. No se guardó nada todavía.");
      return;
    }

    setLoading(true);

    const relatedPackageSlugs = String(data.get("relatedPackageSlugs") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const commonPayload = {
      displayOrder: Number(data.get("displayOrder")),
      isPublished: data.get("isPublished") === "on",
      relatedPackageSlugs,
      content: { es: readContent(data, "es"), en: readContent(data, "en") },
    };

    const url = mode === "create" ? "/api/admin/services" : `/api/admin/services/${serviceId}`;
    const body = mode === "create" ? { slug: String(data.get("slug") ?? "").trim(), ...commonPayload } : commonPayload;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await res.json().catch(() => ({}))) as { ok?: boolean; serviceId?: string; error?: string };

      if (res.ok && result.ok) {
        const id = mode === "create" ? result.serviceId : serviceId;
        router.push(`/admin/services/${id}`);
        router.refresh();
        return;
      }

      if (result.error === "slug_conflict") {
        setError("Ya existe un servicio con ese slug.");
      } else {
        setError("No pudimos guardar el servicio. Revisa los datos e intenta de nuevo.");
      }
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-5">
      <AdminFormSection title="Identificación">
        <div className="grid gap-5 sm:grid-cols-3">
          <AdminField label="Slug" htmlFor="slug">
            <input
              id="slug"
              name="slug"
              type="text"
              required
              disabled={mode === "edit"}
              defaultValue={initialValues?.slug}
              placeholder="seo"
              pattern="[a-z0-9-]+"
              className={inputClasses}
            />
          </AdminField>
          <AdminField label="Orden de despliegue" htmlFor="displayOrder">
            <input
              id="displayOrder"
              name="displayOrder"
              type="number"
              min={0}
              required
              defaultValue={initialValues?.displayOrder ?? 0}
              className={inputClasses}
            />
          </AdminField>
          <AdminField label="Paquetes relacionados" htmlFor="relatedPackageSlugs">
            <input
              id="relatedPackageSlugs"
              name="relatedPackageSlugs"
              type="text"
              defaultValue={initialValues?.relatedPackageSlugs.join(", ")}
              placeholder="start, professional, business"
              className={inputClasses}
            />
            <p className="mt-1.5 text-xs text-fg-subtle">Slugs de Pricing Core separados por coma. Vacío = sin paquete cerrado (cotización).</p>
          </AdminField>
        </div>
      </AdminFormSection>

      <AdminFormSection title="Estado">
        <AdminCheckboxField name="isPublished" defaultChecked={initialValues?.isPublished ?? true}>
          Publicado (visible en /services)
        </AdminCheckboxField>
      </AdminFormSection>

      {LOCALES.map((locale) => {
        const content = initialValues?.content[locale];
        const prefix = `content.${locale}.`;
        const localeFaqErrors = faqErrors[locale];
        return (
          <fieldset key={locale} className="rounded-xl border border-border bg-bg-raised p-6 shadow-soft">
            <legend className="px-2 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-accent-300">{LOCALE_LABELS[locale]}</legend>
            <div className="space-y-5">
              <AdminField label="Título (H1)" htmlFor={`${prefix}heading`}>
                <input
                  id={`${prefix}heading`}
                  name={`${prefix}heading`}
                  type="text"
                  required
                  defaultValue={content?.heading}
                  className={inputClasses}
                />
              </AdminField>
              <AdminField label="Tagline" htmlFor={`${prefix}tagline`}>
                <input
                  id={`${prefix}tagline`}
                  name={`${prefix}tagline`}
                  type="text"
                  required
                  defaultValue={content?.tagline}
                  className={inputClasses}
                />
              </AdminField>
              <AdminField label="Definición (¿Qué es?)" htmlFor={`${prefix}definition`}>
                <textarea id={`${prefix}definition`} name={`${prefix}definition`} rows={2} required defaultValue={content?.definition} className={inputClasses} />
              </AdminField>
              <AdminField label="Problema (una línea por ítem)" htmlFor={`${prefix}problem`}>
                <textarea
                  id={`${prefix}problem`}
                  name={`${prefix}problem`}
                  rows={4}
                  required
                  defaultValue={content ? toLines(content.problem) : ""}
                  className={textareaClasses}
                />
              </AdminField>
              <AdminField label="Solución XAYVEN" htmlFor={`${prefix}solution`}>
                <textarea id={`${prefix}solution`} name={`${prefix}solution`} rows={3} required defaultValue={content?.solution} className={inputClasses} />
              </AdminField>
              <AdminField label="Qué incluye (una línea por ítem)" htmlFor={`${prefix}includes`}>
                <textarea
                  id={`${prefix}includes`}
                  name={`${prefix}includes`}
                  rows={4}
                  required
                  defaultValue={content ? toLines(content.includes) : ""}
                  className={textareaClasses}
                />
              </AdminField>
              <div className="grid gap-5 sm:grid-cols-2">
                <AdminField label="Ideal si... (una línea por ítem)" htmlFor={`${prefix}idealIf`}>
                  <textarea
                    id={`${prefix}idealIf`}
                    name={`${prefix}idealIf`}
                    rows={3}
                    defaultValue={content ? toLines(content.forWhom.idealIf) : ""}
                    className={textareaClasses}
                  />
                </AdminField>
                <AdminField label="No es ideal si... (opcional)" htmlFor={`${prefix}notIdealIf`}>
                  <textarea
                    id={`${prefix}notIdealIf`}
                    name={`${prefix}notIdealIf`}
                    rows={3}
                    defaultValue={content ? toLines(content.forWhom.notIdealIf) : ""}
                    className={textareaClasses}
                  />
                </AdminField>
              </div>
              <AdminField label="Casos de uso (una línea por ítem, opcional)" htmlFor={`${prefix}useCases`}>
                <textarea
                  id={`${prefix}useCases`}
                  name={`${prefix}useCases`}
                  rows={3}
                  defaultValue={content ? toLines(content.useCases) : ""}
                  className={textareaClasses}
                />
              </AdminField>
              <AdminField label="FAQ" htmlFor={`${prefix}faq`}>
                <textarea
                  id={`${prefix}faq`}
                  name={`${prefix}faq`}
                  rows={8}
                  defaultValue={content ? toFaqText(content.faq) : ""}
                  placeholder={"Q: ¿Pregunta?\nA: Respuesta.\n\nQ: ¿Otra pregunta?\nA: Otra respuesta."}
                  aria-invalid={localeFaqErrors.length > 0}
                  aria-describedby={`${prefix}faq-hint${localeFaqErrors.length > 0 ? ` ${prefix}faq-error` : ""}`}
                  className={`${textareaClasses} ${localeFaqErrors.length > 0 ? "border-error" : ""}`}
                />
                <p id={`${prefix}faq-hint`} className="mt-1.5 text-xs text-fg-subtle">
                  {FAQ_FORMAT_HINT}
                </p>
                {localeFaqErrors.length > 0 && (
                  <div id={`${prefix}faq-error`} className="mt-2 rounded-md border border-error/40 bg-error/10 p-3 text-xs text-error">
                    <p className="font-medium">
                      {localeFaqErrors.length === 1
                        ? "1 bloque no se pudo interpretar — falta la línea Q: o A::"
                        : `${localeFaqErrors.length} bloques no se pudieron interpretar — falta la línea Q: o A::`}
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {localeFaqErrors.map((block, i) => (
                        <li key={i} className="whitespace-pre-wrap font-mono">
                          {block}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </AdminField>
            </div>
          </fieldset>
        );
      })}

      {error && <p className="text-sm text-error">{error}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : mode === "create" ? (
          "Crear servicio"
        ) : (
          "Guardar cambios"
        )}
      </Button>
    </form>
  );
}
