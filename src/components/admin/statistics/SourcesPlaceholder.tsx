import { Compass } from "lucide-react";

/**
 * Fase 10 — "fuentes" (UTM/referrer/país) sigue deliberadamente sin
 * implementar: no utm_source, no referrer, no country existen en ningún
 * lado del esquema — esta mitad del mensaje sigue siendo exacta, no se
 * inventa nada aquí. "Promociones" YA NO aplica desde Fase 11 Etapa A —
 * ver PromotionAttributionSummary.tsx, renderizado junto a este
 * componente en la pestaña "fuentes" (no se fusionaron en un solo
 * componente para no reescribir este mensaje de golpe).
 */
export function SourcesPlaceholder() {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-bg-raised p-10 text-center">
      <Compass className="size-6 text-fg-subtle" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-fg">Fuentes</p>
      <p className="mt-2 max-w-md text-sm text-fg-subtle">
        Las fuentes estarán disponibles cuando XAYVEN comience a registrar atribución. Hoy no
        existe ningún dato de origen (Google, Instagram, TikTok, WhatsApp, enlace directo,
        campañas) ni de ubicación — y no se inventa aquí.
      </p>
    </div>
  );
}
