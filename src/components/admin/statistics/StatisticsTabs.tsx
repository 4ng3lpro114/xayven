import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Fase 10 — server-rendered navigation (Link + searchParams), same pattern
 * already used by the period-pill selector on this page — no client
 * component, no JS needed to switch tabs. Only the active tab's data is
 * computed per request (see page.tsx), so switching tabs is a real
 * navigation, not a client-side toggle of pre-fetched data.
 */
export type StatisticsTab =
  | "resumen"
  | "funnel"
  | "leads"
  | "clientes"
  | "proyectos"
  | "finanzas"
  | "velocidad"
  | "ia"
  | "mantenimiento"
  | "fuentes";

export const STATISTICS_TABS: { key: StatisticsTab; label: string }[] = [
  { key: "resumen", label: "Resumen" },
  { key: "funnel", label: "Funnel" },
  { key: "leads", label: "Leads" },
  { key: "clientes", label: "Clientes" },
  { key: "proyectos", label: "Proyectos" },
  { key: "finanzas", label: "Finanzas" },
  { key: "velocidad", label: "Velocidad de conversión" },
  { key: "ia", label: "IA & Conversaciones" },
  { key: "mantenimiento", label: "Mantenimiento" },
  { key: "fuentes", label: "Fuentes & Promociones" },
];

export function isValidStatisticsTab(value: string | undefined): value is StatisticsTab {
  return STATISTICS_TABS.some((t) => t.key === value);
}

export function StatisticsTabs({ activeTab, period }: { activeTab: StatisticsTab; period: string }) {
  function href(tab: StatisticsTab): string {
    const params = new URLSearchParams();
    if (tab !== "resumen") params.set("tab", tab);
    if (period !== "30d") params.set("period", period);
    const qs = params.toString();
    return qs ? `/admin/statistics?${qs}` : "/admin/statistics";
  }

  return (
    <div
      className="-mx-1 mt-6 flex gap-1 overflow-x-auto px-1 pb-1"
      role="tablist"
      aria-label="Secciones de Estadísticas"
    >
      {STATISTICS_TABS.map((tab) => (
        <Link
          key={tab.key}
          href={href(tab.key)}
          role="tab"
          aria-selected={activeTab === tab.key}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium transition-colors",
            activeTab === tab.key
              ? "border-border-accent bg-bg-elevated text-fg"
              : "border-transparent text-fg-muted hover:bg-bg-raised hover:text-fg"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
