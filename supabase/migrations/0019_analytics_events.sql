-- XAYVEN — Analytics Phase 7: capa mínima de eventos de funnel comercial
--
-- La auditoría (Phase 0 de este arco) confirmó que Analytics V2
-- (src/lib/statistics/**) es agregación pura sobre tablas operativas ya
-- existentes — CERO captura de eventos existe en ningún lado del
-- esquema. Esta migración es la primera pieza de captura real, y
-- deliberadamente pequeña: un solo tipo de fila, un CHECK cerrado de
-- 7 tipos de evento (exactamente los del prompt maestro §32, ni uno
-- más), pensada para que el futuro XAYVEN Core pueda extenderla sin
-- rehacerla (§34: "pequeña; consistente; extensible; tipada; segura;
-- reutilizable").
--
-- Puramente aditiva. NO toca clients, projects, payments, promotions,
-- conversations, services, pricing_catalog ni ninguna policy existente.

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Exactamente los 7 eventos mínimos autorizados por el prompt maestro
  -- §32. Un tipo nuevo requiere ampliar este CHECK explícitamente, nunca
  -- un string libre — mismo principio "enum vía CHECK" ya usado por
  -- PaymentType/ProjectStatus/PromotionStatus/PricingCategory en este
  -- proyecto.
  event_type text not null check (event_type in (
    'service_page_view',
    'service_ai_cta',
    'service_project_cta',
    'maintenance_plan_view',
    'maintenance_cta',
    'pricing_package_view',
    'pricing_package_cta'
  )),

  -- Atribución — todos nullable, solo se llenan los relevantes según
  -- event_type. TEXT, nunca FK: mismo principio ya establecido en todo
  -- este arco (services.related_package_slugs,
  -- conversations.service_page_slug) — un evento histórico debe
  -- sobrevivir aunque el servicio/paquete referenciado cambie de slug o
  -- se elimine más adelante.
  service_slug text,
  package_slug text,

  -- Vincula (cuando existe) con la sesión de XAYVEN AI que originó este
  -- evento — mismo session_id no-adivinable que ya usa
  -- getOrCreateSessionId() en clientSession.ts. Nullable: la mayoría de
  -- estos eventos (page_view, cta clicks) ocurren sin que haya una
  -- conversación todavía.
  session_id text,
  locale text,

  -- Reservado para atributos adicionales futuros sin requerir una
  -- migración nueva cada vez — mismo precedente que
  -- promotions.metadata/services.content_es. Vacío hoy, nunca leído por
  -- ninguna lógica de negocio todavía.
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists analytics_events_type_created_idx
  on public.analytics_events (event_type, created_at);

create index if not exists analytics_events_service_slug_idx
  on public.analytics_events (service_slug) where service_slug is not null;

create index if not exists analytics_events_package_slug_idx
  on public.analytics_events (package_slug) where package_slug is not null;

alter table public.analytics_events enable row level security;
-- Mismo modelo que services/pricing_catalog/promotions: RLS habilitado,
-- CERO policies — el único acceso real es vía el service role. La ruta
-- pública que escribe aquí (/api/analytics/event) usa
-- analyticsEventStore.ts server-only con el service role, nunca una
-- consulta directa desde el navegador — el visitante nunca tiene
-- credenciales de Supabase.
