import Link from "next/link";
import { listClients, listPayments, listProjects } from "@/lib/db/paymentsStore";
import { listConversations } from "@/lib/db/conversationStore";
import { buildStatisticsSnapshot } from "@/lib/statistics/aggregate";
import { PROJECT_WORK_STAGE_LABELS_ES } from "@/lib/statistics/projectStages";
import { STATISTICS_PERIODS, type StatisticsPeriod } from "@/lib/statistics/types";
import { StatCard } from "@/components/admin/statistics/StatCard";
import { RevenueChart } from "@/components/admin/statistics/RevenueChart";
import { NewClientsChart } from "@/components/admin/statistics/NewClientsChart";
import { MoneyByCurrencyValue } from "@/components/admin/statistics/MoneyByCurrencyValue";
import { PaymentStatusBadge } from "@/components/payments/PaymentStatusBadge";
import { LeadStatusBadge } from "@/components/admin/LeadStatusBadge";
import { cn } from "@/lib/utils";
import type { PaymentStatus } from "@/lib/payments/types";
import type { LeadStatus } from "@/lib/db/types";

export const dynamic = "force-dynamic";

/**
 * Fase 7B — Centro de Estadísticas.
 *
 * Un solo período controla toda la página (no dos selectores
 * independientes) — más simple y evita que cards/gráficas muestren
 * ventanas de tiempo distintas sin que sea obvio. Ver el informe de la
 * fase para la justificación completa de esta decisión.
 *
 * Mismo patrón de bulk-fetch + reduce en memoria que /admin/clients y
 * /admin/projects (no una query por métrica) — buildStatisticsSnapshot()
 * es puro y calcula TODO en una sola pasada sobre estos 4 arreglos.
 */
const AGGREGATION_LIMIT = 5000;

const PAYMENT_STATUS_LABELS_ES: Record<PaymentStatus, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  DECLINED: "Rechazado",
  ERROR: "Error",
  VOIDED: "Anulado",
  REFUNDED: "Reembolsado",
};

function isValidPeriod(value: string | undefined): value is StatisticsPeriod {
  return STATISTICS_PERIODS.some((p) => p.key === value);
}

function buildPeriodHref(period: StatisticsPeriod): string {
  return period === "30d" ? "/admin/statistics" : `/admin/statistics?period=${period}`;
}

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}

export default async function AdminStatisticsPage({ searchParams }: PageProps) {
  const { period: rawPeriod } = await searchParams;
  const period: StatisticsPeriod = isValidPeriod(rawPeriod) ? rawPeriod : "30d";

  const [clients, conversations, projects, payments] = await Promise.all([
    listClients(),
    listConversations({ limit: AGGREGATION_LIMIT }),
    listProjects(),
    listPayments({ limit: AGGREGATION_LIMIT }),
  ]);

  const snapshot = buildStatisticsSnapshot({ clients, conversations, projects, payments, period });

  const workStages = ["completed", "in_progress", "pending", "cancelled"] as const;
  const completedPct =
    snapshot.projects.totalAllTime > 0
      ? Math.round((snapshot.projects.byStage.completed / snapshot.projects.totalAllTime) * 100)
      : null;

  const paymentStatuses: PaymentStatus[] = ["APPROVED", "PENDING", "DECLINED", "ERROR", "VOIDED", "REFUNDED"];
  const leadStatuses: LeadStatus[] = ["exploring", "interested", "hot", "client", "support"];

  // "período=all" se lee raro dentro de una frase ("nuevos en Todo") — solo
  // para estas frases in-line se usa "en total" en vez del label del pill.
  const periodPhrase = period === "all" ? "en total" : `en ${snapshot.periodLabel.toLowerCase()}`;

  return (
    <div>
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Estadísticas</h1>
          <p className="mt-1 text-sm text-fg-muted">Resumen de tu negocio</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {STATISTICS_PERIODS.map((p) => (
          <Link
            key={p.key}
            href={buildPeriodHref(p.key)}
            className={cn(
              "rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors",
              period === p.key
                ? "border-border-accent bg-bg-elevated text-fg"
                : "border-border-strong text-fg-muted hover:text-fg"
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Cards principales */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Clientes"
          value={snapshot.clients.totalAllTime}
          caption={`+${snapshot.clients.newInPeriod} nuevos ${periodPhrase}`}
          trendPct={snapshot.clients.growthPct}
        />
        <StatCard
          label="Ingresos"
          value={<MoneyByCurrencyValue byCurrency={snapshot.revenuePeriod.receivedByCurrency} />}
          caption={`${snapshot.revenuePeriod.approvedPaymentsCount} pagos aprobados ${periodPhrase}`}
          trendPct={snapshot.revenuePeriod.growthPct}
        />
        <StatCard
          label="Proyectos"
          value={snapshot.projects.totalAllTime}
          caption={`${snapshot.projects.byStage.in_progress} en progreso · ${snapshot.projects.byStage.completed} completados`}
        />
        <StatCard
          label="Pendiente por cobrar"
          value={<MoneyByCurrencyValue byCurrency={snapshot.projects.pendingByCurrency} />}
          caption="Todo el tiempo, excluye proyectos cancelados"
          accent
        />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Gráfica principal */}
      <h2 className="mt-10 text-lg font-semibold text-fg">Ingresos en el tiempo</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Pagos aprobados, agrupados por fecha real de aprobación — no por fecha de creación del
        proyecto.
      </p>
      <div className="mt-4">
        <RevenueChart
          points={snapshot.revenueSeries.points}
          currency={snapshot.revenueSeries.currency}
          otherCurrenciesExcluded={snapshot.revenueSeries.otherCurrenciesExcluded}
          periodLabel={snapshot.periodLabel}
        />
      </div>
      <div className="mt-4">
        <NewClientsChart points={snapshot.newClientsSeries.points} periodLabel={snapshot.periodLabel} />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Trabajos / Proyectos */}
      <h2 className="mt-10 text-lg font-semibold text-fg">Trabajos</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Clasificación de {snapshot.projects.totalAllTime} proyectos por etapa (todo el tiempo, no
        filtrable por período — es el estado actual del portafolio).
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {workStages.map((stage) => (
          <StatCard
            key={stage}
            label={PROJECT_WORK_STAGE_LABELS_ES[stage]}
            value={snapshot.projects.byStage[stage]}
            caption={stage === "cancelled" ? "No cuenta como trabajo activo" : undefined}
            accent={stage === "completed"}
            muted={stage === "cancelled"}
          />
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-bg-raised p-5">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">
            Valor contratado
          </p>
          <p className="mt-2 text-lg font-semibold text-fg">
            <MoneyByCurrencyValue byCurrency={snapshot.projects.contractedByCurrency} />
          </p>
        </div>
        <div className="rounded-lg border border-border bg-bg-raised p-5">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">
            Valor recibido
          </p>
          <p className="mt-2 text-lg font-semibold text-fg">
            <MoneyByCurrencyValue byCurrency={snapshot.finance.receivedByCurrency} />
          </p>
        </div>
        <div className="rounded-lg border border-border bg-bg-raised p-5">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">Pendiente</p>
          <p className="mt-2 text-lg font-semibold text-fg">
            <MoneyByCurrencyValue byCurrency={snapshot.projects.pendingByCurrency} />
          </p>
        </div>
      </div>
      {completedPct !== null && (
        <p className="mt-3 text-xs text-fg-subtle">{completedPct}% de los proyectos están completados.</p>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Clientes y Leads */}
      <h2 className="mt-10 text-lg font-semibold text-fg">Clientes y leads</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Nuevos clientes"
          value={snapshot.clients.newInPeriod}
          caption={snapshot.periodLabel}
        />
        <StatCard
          label="Conversaciones nuevas"
          value={snapshot.leads.newInPeriod}
          caption={snapshot.periodLabel}
        />
        <StatCard
          label="Interesados"
          value={snapshot.leads.byStatus.interested + snapshot.leads.byStatus.hot}
          caption="Estado actual (interesado + caliente)"
        />
        <StatCard
          label="Clientes convertidos"
          value={snapshot.conversion.convertedClientsCount}
          caption="Todo el tiempo"
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {leadStatuses.map((status) => (
          <div
            key={status}
            className="flex items-center gap-2 rounded-lg border border-border bg-bg-raised px-3 py-2"
          >
            <LeadStatusBadge status={status} />
            <span className="text-sm text-fg-muted">{snapshot.leads.byStatus[status]}</span>
          </div>
        ))}
      </div>
      {snapshot.leads.averageScoreInPeriod !== null && (
        <p className="mt-3 text-xs text-fg-subtle">
          Score promedio de los leads nuevos ({period === "all" ? "todo el tiempo" : snapshot.periodLabel.toLowerCase()}
          ): {snapshot.leads.averageScoreInPeriod}/100.
        </p>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Conversión */}
      <h2 className="mt-10 text-lg font-semibold text-fg">Conversión</h2>
      <p className="mt-1 max-w-2xl text-sm text-fg-muted">
        Proporción acumulada de conversaciones que hoy están vinculadas a un cliente real. Es un
        total histórico, no filtrable por período — el sistema no registra la fecha exacta en la
        que cada lead se convirtió, solo si está convertido ahora mismo.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <StatCard label="Conversaciones" value={snapshot.conversion.conversationsTotal} caption="Todo el tiempo" />
        <StatCard
          label="Interesados"
          value={snapshot.leads.byStatus.interested}
          caption="Estado actual"
        />
        <StatCard label="Clientes" value={snapshot.conversion.convertedClientsCount} caption="Convertidos" />
        <StatCard
          label="Conversión"
          value={snapshot.conversion.conversionRatePct !== null ? `${snapshot.conversion.conversionRatePct}%` : "—"}
          caption="Clientes / conversaciones"
          accent
        />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Finanzas */}
      <h2 className="mt-10 text-lg font-semibold text-fg">Finanzas</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Todo el tiempo. &quot;Recibido&quot; es siempre dinero real de pagos aprobados — nunca el
        valor contratado.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Valor contratado"
          value={<MoneyByCurrencyValue byCurrency={snapshot.finance.contractedByCurrency} />}
        />
        <StatCard
          label="Recibido"
          value={<MoneyByCurrencyValue byCurrency={snapshot.finance.receivedByCurrency} />}
          caption={`${snapshot.finance.approvedPaymentsCount} pagos aprobados`}
          accent
        />
        <StatCard
          label="Pendiente"
          value={<MoneyByCurrencyValue byCurrency={snapshot.finance.pendingByCurrency} />}
        />
        <StatCard
          label="Ticket promedio"
          value={<MoneyByCurrencyValue byCurrency={snapshot.finance.averageApprovedTicketByCurrency} />}
          caption="Por pago aprobado"
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {paymentStatuses.map((status) => (
          <div
            key={status}
            className="flex items-center gap-2 rounded-lg border border-border bg-bg-raised px-3 py-2"
          >
            <PaymentStatusBadge status={status} label={PAYMENT_STATUS_LABELS_ES[status]} />
            <span className="text-sm text-fg-muted">{snapshot.finance.paymentsByStatus[status]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
