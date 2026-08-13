import { Compass } from "lucide-react";

/**
 * Fase 10 — deliberately NOT implemented. No utm_source, no referrer, no
 * country, no promotion_id exist anywhere in the schema (see the Fase 10
 * Etapa 1 audit) — this tab exists only to say so clearly, never to
 * fabricate a channel/attribution figure from something else (locale, IP).
 */
export function SourcesPlaceholder() {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-bg-raised p-10 text-center">
      <Compass className="size-6 text-fg-subtle" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-fg">Fuentes y promociones</p>
      <p className="mt-2 max-w-md text-sm text-fg-subtle">
        Las fuentes y promociones estarán disponibles cuando XAYVEN comience a registrar
        atribución. Hoy no existe ningún dato de origen (Google, Instagram, TikTok, WhatsApp,
        enlace directo, campañas) ni de ubicación — y no se inventa aquí.
      </p>
    </div>
  );
}
