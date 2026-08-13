import Link from "next/link";
import { listClients, listPayments, listProjects } from "@/lib/db/paymentsStore";
import { listConversations, listAllLeadStatusHistory } from "@/lib/db/conversationStore";
import { listMaintenanceRequests } from "@/lib/db/maintenanceStore";
import { buildClientSummaries } from "@/lib/clients/summary";
import {
  buildStatisticsSnapshot,
  buildFunnelSnapshot,
  buildFunnelEvolution,
  buildLeadsSeries,
  buildProjectsSeries,
  buildConversionsSeries,
  buildClientsExtendedStats,
  buildProjectRawStatusBreakdown,
  buildRevenueByProject,
  buildRevenueByClient,
  buildRevenueByPaymentType,
  buildAIConversationStats,
  buildMaintenanceStats,
} from "@/lib/statistics/aggregate";
import { buildConversionVelocityStats } from "@/lib/statistics/conversionVelocity";
import { buildLeadActivityStats } from "@/lib/statistics/leadActivity";
import { PROJECT_WORK_STAGE_LABELS_ES } from "@/lib/statistics/projectStages";
import { STATISTICS_PERIODS, PAYMENT_TYPE_LABELS_ES, type StatisticsPeriod } from "@/lib/statistics/types";
import { StatCard } from "@/components/admin/statistics/StatCard";
import { RevenueChart } from "@/components/admin/statistics/RevenueChart";
import { NewClientsChart } from "@/components/admin/statistics/NewClientsChart";
import { MiniBarSeriesChart } from "@/components/admin/statistics/MiniBarSeriesChart";
import { MoneyByCurrencyValue } from "@/components/admin/statistics/MoneyByCurrencyValue";
import { FunnelChart } from "@/components/admin/statistics/FunnelChart";
import { FunnelEvolutionChart } from "@/components/admin/statistics/FunnelEvolutionChart";
import { ConversionVelocityCard } from "@/components/admin/statistics/ConversionVelocityCard";
import { RevenueByGroupTable } from "@/components/admin/statistics/RevenueByGroupTable";
import { SourcesPlaceholder } from "@/components/admin/statistics/SourcesPlaceholder";
import { StatisticsTabs, isValidStatisticsTab, type StatisticsTab } from "@/components/admin/statistics/StatisticsTabs";
import { PaymentStatusBadge } from "@/components/payments/PaymentStatusBadge";
import { LeadStatusBadge } from "@/components/admin/LeadStatusBadge";
import { cn } from "@/lib/utils";
import type { PaymentStatus, PaymentType } from "@/lib/payments/types";
import type { LeadStatus } from "@/lib/db/types";

export const dynamic = "force-dynamic";

/**
 * Fase 10 — Analytics V2. Reorganiza el antiguo Centro de Estadísticas
 * (Fase 7B) en pestañas — Resumen se mantiene siempre como el "primer
 * vistazo", el resto se calcula solo cuando su pestaña está activa (misma
 * disciplina de bulk-fetch + reducción en memoria, ahora aplicada por
 * pestaña en vez de a la página entera de una sola vez). Un único selector
 * de período sigue controlando toda la página, tal como en Fase 7B — nunca
 * selectores independientes por sección.
 *
 * Ningún dato se inventa: cada número enlaza a una función pura en
 * src/lib/statistics/ (o a leadActivity.ts / conversionVelocity.ts), cada
 * una documentada con su fuente exacta. Ver el informe de Fase 10 Etapa 1
 * (auditoría) para la clasificación completa.
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

const PAYMENT_TYPES: PaymentType[] = ["DEPOSIT", "BALANCE", "FULL_PAYMENT", "MAINTENANCE"];

function isValidPeriod(value: string | undefined): value is StatisticsPeriod {
  return STATISTICS_PERIODS.some((p) => p.key === value);
}

function buildPeriodHref(period: StatisticsPeriod, tab: StatisticsTab): string {
  const params = new URLSearchParams();
  if (tab !== "resumen") params.set("tab", tab);
  if (period !== "30d") params.set("period", period);
  const qs = params.toString();
  return qs ? `/admin/statistics?${qs}` : "/admin/statistics";
}

interface PageProps {
  searchParams: Promise<{ period?: string; tab?: string }>;
}

export default async function AdminStatisticsPage({ searchParams }: PageProps) {
  const { period: rawPeriod, tab: rawTab } = await searchParams;
  const period: StatisticsPeriod = isValidPeriod(rawPeriod) ? rawPeriod : "30d";
  const tab: StatisticsTab = isValidStatisticsTab(rawTab) ? rawTab : "resumen";
  const now = new Date();

  // Bulk-fetch, siempre necesario (varias pestañas lo usan, incluida
  // Resumen) — mismo patrón que Fase 7B, nunca una consulta por métrica.
  const [clients, conversations, projects, payments] = await Promise.all([
    listClients(),
    listConversations({ limit: AGGREGATION_LIMIT }),
    listProjects(),
    listPayments({ limit: AGGREGATION_LIMIT }),
  ]);

  const snapshot = buildStatisticsSnapshot({ clients, conversations, projects, payments, period });
  const aiStats = buildAIConversationStats(conversations, period, now);

  const periodPhrase = period === "all" ? "en total" : `en ${snapshot.periodLabel.toLowerCase()}`;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Estadísticas</h1>
          <p className="mt-1 text-sm text-fg-muted">Centro de inteligencia administrativa de XAYVEN</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {STATISTICS_PERIODS.map((p) => (
          <Link
            key={p.key}
            href={buildPeriodHref(p.key, tab)}
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

      <StatisticsTabs activeTab={tab} period={period} />

      <div className="mt-8">
        {tab === "resumen" && (
          <ResumenTab snapshot={snapshot} aiStats={aiStats} periodPhrase={periodPhrase} />
        )}
        {tab === "funnel" && (
          <FunnelTab conversations={conversations} period={period} now={now} />
        )}
        {tab === "leads" && (
          <LeadsTab conversations={conversations} period={period} now={now} periodLabel={snapshot.periodLabel} />
        )}
        {tab === "clientes" && (
          <ClientesTab
            clients={clients}
            conversations={conversations}
            projects={projects}
            payments={payments}
            snapshot={snapshot}
            periodPhrase={periodPhrase}
          />
        )}
        {tab === "proyectos" && (
          <ProyectosTab snapshot={snapshot} projects={projects} period={period} now={now} />
        )}
        {tab === "finanzas" && (
          <FinanzasTab snapshot={snapshot} payments={payments} projects={projects} clients={clients} period={period} />
        )}
        {tab === "velocidad" && <VelocidadTab conversations={conversations} />}
        {tab === "ia" && (
          <IATab snapshot={snapshot} aiStats={aiStats} periodPhrase={periodPhrase} />
        )}
        {tab === "mantenimiento" && <MantenimientoTab payments={payments} />}
        {tab === "fuentes" && <SourcesPlaceholder />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------

function ResumenTab({
  snapshot,
  aiStats,
  periodPhrase,
}: {
  snapshot: ReturnType<typeof buildStatisticsSnapshot>;
  aiStats: ReturnType<typeof buildAIConversationStats>;
  periodPhrase: string;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Clientes nuevos"
          value={snapshot.clients.newInPeriod}
          caption={periodPhrase}
          trendPct={snapshot.clients.growthPct}
        />
        <StatCard
          label="Leads nuevos"
          value={aiStats.leadGeneratingConversationsInPeriod}
          caption={`Conversaciones que califican como lead, ${periodPhrase}`}
        />
        <StatCard
          label="Conversaciones"
          value={snapshot.leads.newInPeriod}
          caption={periodPhrase}
        />
        <StatCard
          label="Conversiones"
          value={snapshot.conversionPeriod.convertedInPeriod}
          caption={
            snapshot.conversionPeriod.unknownDateConversionsAllTime > 0
              ? `+${snapshot.conversionPeriod.unknownDateConversionsAllTime} con fecha desconocida (histórico)`
              : periodPhrase
          }
        />
        <StatCard
          label="Tasa de conversión"
          value={
            snapshot.conversion.conversionRatePct !== null ? `${snapshot.conversion.conversionRatePct}%` : "—"
          }
          caption="Histórica, todo el tiempo — no varía por período"
          accent
        />
        <StatCard
          label="Ingresos"
          value={<MoneyByCurrencyValue byCurrency={snapshot.revenuePeriod.receivedByCurrency} />}
          caption={`${snapshot.revenuePeriod.approvedPaymentsCount} pagos aprobados ${periodPhrase}`}
          trendPct={snapshot.revenuePeriod.growthPct}
        />
        <StatCard
          label="Pendiente por cobrar"
          value={<MoneyByCurrencyValue byCurrency={snapshot.projects.pendingByCurrency} />}
          caption="Todo el tiempo, excluye cancelados"
        />
        <StatCard
          label="Ticket promedio"
          value={<MoneyByCurrencyValue byCurrency={snapshot.finance.averageApprovedTicketByCurrency} />}
          caption="Por pago aprobado, histórico"
        />
        <StatCard
          label="Proyectos creados"
          value={snapshot.projects.newInPeriod}
          caption={periodPhrase}
        />
        <StatCard
          label="Proyectos completados"
          value={snapshot.projects.byStage.completed}
          caption="Todo el tiempo"
          accent
        />
      </div>

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
    </>
  );
}

// ---------------------------------------------------------------------------
// Funnel
// ---------------------------------------------------------------------------

async function FunnelTab({
  conversations,
  period,
  now,
}: {
  conversations: Awaited<ReturnType<typeof listConversations>>;
  period: StatisticsPeriod;
  now: Date;
}) {
  const history = await listAllLeadStatusHistory({ limit: AGGREGATION_LIMIT });
  const snapshot = buildFunnelSnapshot(conversations);
  const evolution = buildFunnelEvolution(history, period, now);
  const conversionsSeries = buildConversionsSeries(conversations, period, now);

  return (
    <>
      <h2 className="text-lg font-semibold text-fg">Foto actual</h2>
      <p className="mt-1 max-w-2xl text-sm text-fg-muted">
        Basado en <code>conversations.lead_status</code> — cada etapa muestra cuántas conversaciones
        están hoy en esa etapa o más allá, no un log histórico de progreso.
      </p>
      <div className="mt-4">
        <FunnelChart snapshot={snapshot} />
      </div>

      <h2 className="mt-10 text-lg font-semibold text-fg">Evolución histórica</h2>
      <p className="mt-1 max-w-2xl text-sm text-fg-muted">
        Basado en <code>lead_status_history</code> — transiciones reales registradas desde el
        12-ago-2026, sin reconstrucción retroactiva de conversaciones anteriores.
      </p>
      <div className="mt-4">
        <FunnelEvolutionChart evolution={evolution} />
      </div>

      <h2 className="mt-10 text-lg font-semibold text-fg">Conversiones en el tiempo</h2>
      <p className="mt-1 max-w-2xl text-sm text-fg-muted">
        Basado en <code>converted_at</code> — solo conversiones con fecha conocida (posteriores a
        Fase 9B).
      </p>
      <div className="mt-4 rounded-lg border border-border bg-bg-raised p-5">
        <MiniBarSeriesChart
          points={conversionsSeries.points}
          color="var(--color-success)"
          emptyLabel="Sin conversiones con fecha conocida en este período"
          unitLabelSingular="conversión"
          unitLabelPlural="conversiones"
          height={140}
        />
        {conversionsSeries.unknownDateConversionsAllTime > 0 && (
          <p className="mt-3 text-xs text-fg-subtle">
            +{conversionsSeries.unknownDateConversionsAllTime}{" "}
            {conversionsSeries.unknownDateConversionsAllTime === 1 ? "conversión" : "conversiones"} con
            fecha desconocida (anteriores a Fase 9B) — no representadas arriba, nunca tratadas como
            &quot;ahora&quot;.
          </p>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

function LeadsTab({
  conversations,
  period,
  now,
  periodLabel,
}: {
  conversations: Awaited<ReturnType<typeof listConversations>>;
  period: StatisticsPeriod;
  now: Date;
  periodLabel: string;
}) {
  const activity = buildLeadActivityStats(conversations, now);
  const series = buildLeadsSeries(conversations, period, now);
  const leadStatuses: LeadStatus[] = ["exploring", "interested", "hot", "client", "support"];
  const byStatus: Record<LeadStatus, number> = {
    exploring: 0,
    interested: 0,
    hot: 0,
    client: 0,
    support: 0,
  };
  for (const c of conversations) byStatus[c.leadStatus] += 1;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Leads activos" value={activity.activeCount} caption="Actualizados en los últimos 7 días" accent />
        <StatCard label="Leads estancados" value={activity.stalledCount} caption="14+ días sin actividad" muted />
        <StatCard
          label="Leads convertidos"
          value={conversations.filter((c) => c.clientId !== null).length}
          caption="Todo el tiempo"
        />
        <StatCard
          label="Días desde última actividad"
          value={activity.averageDaysSinceActivity !== null ? activity.averageDaysSinceActivity : "—"}
          caption="Promedio, leads en pipeline"
        />
      </div>

      <h2 className="mt-10 text-lg font-semibold text-fg">Leads nuevos en el tiempo</h2>
      <div className="mt-4 rounded-lg border border-border bg-bg-raised p-5">
        <MiniBarSeriesChart
          points={series.points}
          emptyLabel="Sin leads nuevos en este período"
          unitLabelSingular="lead nuevo"
          unitLabelPlural="leads nuevos"
          height={160}
        />
        <p className="mt-2 text-xs text-fg-subtle">{periodLabel}</p>
      </div>

      <h2 className="mt-10 text-lg font-semibold text-fg">Por estado</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {leadStatuses.map((status) => (
          <div
            key={status}
            className="flex items-center gap-2 rounded-lg border border-border bg-bg-raised px-3 py-2"
          >
            <LeadStatusBadge status={status} />
            <span className="text-sm text-fg-muted">{byStatus[status]}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

function ClientesTab({
  clients,
  conversations,
  projects,
  payments,
  snapshot,
  periodPhrase,
}: {
  clients: Awaited<ReturnType<typeof listClients>>;
  conversations: Awaited<ReturnType<typeof listConversations>>;
  projects: Awaited<ReturnType<typeof listProjects>>;
  payments: Awaited<ReturnType<typeof listPayments>>;
  snapshot: ReturnType<typeof buildStatisticsSnapshot>;
  periodPhrase: string;
}) {
  const summaries = buildClientSummaries({ clients, conversations, projects, payments });
  const extended = buildClientsExtendedStats(summaries);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Clientes nuevos" value={snapshot.clients.newInPeriod} caption={periodPhrase} trendPct={snapshot.clients.growthPct} />
        <StatCard label="Clientes totales" value={snapshot.clients.totalAllTime} caption="Todo el tiempo" />
        <StatCard label="Con proyectos" value={extended.withProjectsCount} caption="Todo el tiempo" />
        <StatCard label="Recurrentes" value={extended.recurringCount} caption="Más de un proyecto" accent />
      </div>

      <h2 className="mt-10 text-lg font-semibold text-fg">Valor generado</h2>
      <p className="mt-1 max-w-2xl text-sm text-fg-muted">
        Suma de pagos recibidos por cliente, todo el tiempo. Para el detalle de un cliente
        (nombre, contacto, actividad), visita{" "}
        <Link href="/admin/clients" className="underline">
          /admin/clients
        </Link>
        .
      </p>
      <div className="mt-4 rounded-lg border border-border bg-bg-raised p-5">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">Total pagado, todos los clientes</p>
        <p className="mt-2 text-2xl font-semibold text-fg">
          <MoneyByCurrencyValue byCurrency={extended.totalPaidByCurrency} />
        </p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Proyectos
// ---------------------------------------------------------------------------

function ProyectosTab({
  snapshot,
  projects,
  period,
  now,
}: {
  snapshot: ReturnType<typeof buildStatisticsSnapshot>;
  projects: Awaited<ReturnType<typeof listProjects>>;
  period: StatisticsPeriod;
  now: Date;
}) {
  const workStages = ["completed", "in_progress", "pending", "cancelled"] as const;
  const series = buildProjectsSeries(projects, period, now);
  const rawBreakdown = buildProjectRawStatusBreakdown(projects);
  const rawStatuses = Object.keys(rawBreakdown) as (keyof typeof rawBreakdown)[];

  return (
    <>
      {/* "Creados" es period-scoped; las 4 etapas de abajo son todo el tiempo
          (una foto del portafolio actual, no filtrable por período) — se
          separan en dos filas en vez de mezclarse en una sola grilla de 5,
          que dejaba "Cancelados" solo en su propia fila. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Proyectos creados" value={snapshot.projects.newInPeriod} caption="En el período seleccionado" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {workStages.map((stage) => (
          <StatCard
            key={stage}
            label={PROJECT_WORK_STAGE_LABELS_ES[stage]}
            value={snapshot.projects.byStage[stage]}
            caption={stage === "cancelled" ? "No cuenta como trabajo activo" : "Todo el tiempo"}
            accent={stage === "completed"}
            muted={stage === "cancelled"}
          />
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold text-fg">Proyectos creados en el tiempo</h2>
      <div className="mt-4 rounded-lg border border-border bg-bg-raised p-5">
        <MiniBarSeriesChart
          points={series.points}
          emptyLabel="Sin proyectos nuevos en este período"
          unitLabelSingular="proyecto nuevo"
          unitLabelPlural="proyectos nuevos"
          height={140}
        />
      </div>

      <h2 className="mt-10 text-lg font-semibold text-fg">Valor</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-bg-raised p-5">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">Valor contratado</p>
          <p className="mt-2 text-lg font-semibold text-fg">
            <MoneyByCurrencyValue byCurrency={snapshot.projects.contractedByCurrency} />
          </p>
        </div>
        <div className="rounded-lg border border-border bg-bg-raised p-5">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">Valor recibido</p>
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

      <h2 className="mt-10 text-lg font-semibold text-fg">Desglose por estado real</h2>
      <p className="mt-1 max-w-2xl text-sm text-fg-muted">
        Los 9 valores reales de <code>ProjectStatus</code>, sin agrupar — un detalle opcional, no
        reemplaza las 4 tarjetas de arriba.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {rawStatuses.map((status) => (
          <div
            key={status}
            className="flex items-center gap-2 rounded-lg border border-border bg-bg-raised px-3 py-2"
          >
            <span className="font-mono text-xs text-fg-muted">{status}</span>
            <span className="text-sm text-fg">{rawBreakdown[status]}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Finanzas
// ---------------------------------------------------------------------------

function FinanzasTab({
  snapshot,
  payments,
  projects,
  clients,
  period,
}: {
  snapshot: ReturnType<typeof buildStatisticsSnapshot>;
  payments: Awaited<ReturnType<typeof listPayments>>;
  projects: Awaited<ReturnType<typeof listProjects>>;
  clients: Awaited<ReturnType<typeof listClients>>;
  period: StatisticsPeriod;
}) {
  const paymentStatuses: PaymentStatus[] = ["APPROVED", "PENDING", "DECLINED", "ERROR", "VOIDED", "REFUNDED"];
  const byProject = buildRevenueByProject(payments, projects);
  const byClient = buildRevenueByClient(payments, clients);
  const byType = buildRevenueByPaymentType(payments);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Valor contratado" value={<MoneyByCurrencyValue byCurrency={snapshot.finance.contractedByCurrency} />} />
        <StatCard
          label="Recibido"
          value={<MoneyByCurrencyValue byCurrency={snapshot.finance.receivedByCurrency} />}
          caption={`${snapshot.finance.approvedPaymentsCount} pagos aprobados`}
          accent
        />
        <StatCard label="Pendiente" value={<MoneyByCurrencyValue byCurrency={snapshot.finance.pendingByCurrency} />} />
        <StatCard label="Ticket promedio" value={<MoneyByCurrencyValue byCurrency={snapshot.finance.averageApprovedTicketByCurrency} />} caption="Por pago aprobado" />
      </div>

      <h2 className="mt-10 text-lg font-semibold text-fg">Ingresos en el período</h2>
      <div className="mt-4">
        <RevenueChart
          points={snapshot.revenueSeries.points}
          currency={snapshot.revenueSeries.currency}
          otherCurrenciesExcluded={snapshot.revenueSeries.otherCurrenciesExcluded}
          periodLabel={snapshot.periodLabel}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div>
          <h3 className="text-sm font-semibold text-fg">Por proyecto</h3>
          <div className="mt-3">
            <RevenueByGroupTable entries={byProject.entries} emptyLabel="Sin pagos aprobados todavía" linkPrefix="/admin/projects/" />
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-fg">Por cliente</h3>
          <div className="mt-3">
            <RevenueByGroupTable entries={byClient.entries} emptyLabel="Sin pagos aprobados todavía" linkPrefix="/admin/clients/" />
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-fg">Por tipo de pago</h3>
          <div className="mt-3 overflow-hidden rounded-lg border border-border bg-bg-raised">
            <ul className="divide-y divide-border">
              {PAYMENT_TYPES.map((type) => (
                <li key={type} className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
                  <span className="text-sm text-fg">{PAYMENT_TYPE_LABELS_ES[type]}</span>
                  <span className="shrink-0 text-sm font-medium text-fg">
                    <MoneyByCurrencyValue byCurrency={byType.byType[type]} fallback="—" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <h2 className="mt-10 text-lg font-semibold text-fg">Pagos por estado</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {paymentStatuses.map((status) => (
          <div key={status} className="flex items-center gap-2 rounded-lg border border-border bg-bg-raised px-3 py-2">
            <PaymentStatusBadge status={status} label={PAYMENT_STATUS_LABELS_ES[status]} />
            <span className="text-sm text-fg-muted">{snapshot.finance.paymentsByStatus[status]}</span>
          </div>
        ))}
      </div>
      {period !== "all" && (
        <p className="mt-4 text-xs text-fg-subtle">
          Las cifras de esta sección son todo-el-tiempo salvo &quot;Ingresos en el período&quot;, que sí
          respeta el selector de período.
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Velocidad de conversión
// ---------------------------------------------------------------------------

/**
 * Deliberadamente TODO EL TIEMPO, no filtrable por período — mismo criterio
 * ya aplicado a la sección "Conversión" de Fase 7B (histórica por diseño).
 * Con muestras tan pequeñas, cortar por período solo reduciría más la
 * representatividad sin ganar nada; y una transición que empieza antes del
 * período pero termina dentro perdería su otro extremo si se filtrara.
 */
async function VelocidadTab({ conversations }: { conversations: Awaited<ReturnType<typeof listConversations>> }) {
  const history = await listAllLeadStatusHistory({ limit: AGGREGATION_LIMIT });
  const velocity = buildConversionVelocityStats(history, conversations);

  if (!velocity.hasAnyHistoryData) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-border bg-bg-raised p-10 text-center">
        <p className="max-w-md text-sm text-fg-muted">
          Estamos recopilando datos de conversión. Las métricas aparecerán a medida que XAYVEN
          registre nuevas transiciones.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="max-w-2xl text-sm text-fg-muted">
        Todo el tiempo, no filtrable por período — con muestras pequeñas, cortar por período solo
        perdería representatividad.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ConversionVelocityCard label="Explorando → Interesado" stats={velocity.exploringToInterested} />
        <ConversionVelocityCard label="Interesado → Caliente" stats={velocity.interestedToHot} />
        <ConversionVelocityCard label="Caliente → Cliente" stats={velocity.hotToClient} />
        <ConversionVelocityCard label="Tiempo total hasta conversión" stats={velocity.totalTimeToConversion} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// IA & Conversaciones
// ---------------------------------------------------------------------------

function IATab({
  snapshot,
  aiStats,
  periodPhrase,
}: {
  snapshot: ReturnType<typeof buildStatisticsSnapshot>;
  aiStats: ReturnType<typeof buildAIConversationStats>;
  periodPhrase: string;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Conversaciones nuevas" value={snapshot.leads.newInPeriod} caption={periodPhrase} />
        <StatCard
          label="Generan un lead"
          value={aiStats.leadGeneratingConversationsInPeriod}
          caption={aiStats.leadGenerationRatePct !== null ? `${aiStats.leadGenerationRatePct}% de las conversaciones` : periodPhrase}
          accent
        />
        <StatCard label="Tasa de conversión" value={snapshot.conversion.conversionRatePct !== null ? `${snapshot.conversion.conversionRatePct}%` : "—"} caption="Histórica" />
        <StatCard
          label="Mensajes por conversación"
          value={aiStats.averageMessagesPerConversationInPeriod !== null ? aiStats.averageMessagesPerConversationInPeriod : "—"}
          caption={`Promedio, ${periodPhrase}`}
        />
      </div>
      <p className="mt-6 max-w-2xl text-xs text-fg-subtle">
        &quot;Genera un lead&quot; = la conversación avanzó más allá de &quot;explorando&quot; o el
        visitante dejó un correo real — la misma señal que ya alimenta el puntaje del lead, no una
        definición nueva.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Mantenimiento
// ---------------------------------------------------------------------------

async function MantenimientoTab({ payments }: { payments: Awaited<ReturnType<typeof listPayments>> }) {
  const requests = await listMaintenanceRequests({ limit: AGGREGATION_LIMIT });
  const stats = buildMaintenanceStats(requests, payments);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Solicitudes totales" value={stats.totalAllTime} caption="Todo el tiempo" />
        <StatCard label="Nuevas" value={stats.newCount} accent />
        <StatCard label="Contactadas" value={stats.contactedCount} />
        <StatCard label="Resueltas" value={stats.resolvedCount} muted />
      </div>

      <h2 className="mt-10 text-lg font-semibold text-fg">Ingresos de mantenimiento</h2>
      <p className="mt-1 max-w-2xl text-sm text-fg-muted">
        Pagos aprobados con tipo &quot;Mantenimiento&quot;, todo el tiempo. Los planes (Essential,
        Growth, Care+) todavía no existen como sistema — no se inventan aquí.
      </p>
      <div className="mt-4 rounded-lg border border-border bg-bg-raised p-5">
        <p className="text-2xl font-semibold text-fg">
          <MoneyByCurrencyValue byCurrency={stats.revenueByCurrency} />
        </p>
      </div>
    </>
  );
}
