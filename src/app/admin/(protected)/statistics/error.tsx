"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Next.js App Router error boundary convention (must be a Client
 * Component) — catches any unexpected failure computing/rendering this
 * page's statistics and shows an on-brand message instead of a blank
 * screen, with a retry that just re-renders the segment.
 */
export default function StatisticsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[admin/statistics] render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-lg border border-border bg-bg-raised p-10 text-center">
      <AlertTriangle className="size-6 text-error" aria-hidden="true" />
      <h1 className="mt-3 text-lg font-semibold text-fg">No pudimos cargar las estadísticas</h1>
      <p className="mt-1 max-w-sm text-sm text-fg-muted">
        Ocurrió un error inesperado calculando estos datos. Intenta de nuevo — si persiste, revisa
        los logs del servidor.
      </p>
      <Button variant="secondary" className="mt-5" onClick={() => reset()}>
        Reintentar
      </Button>
    </div>
  );
}
