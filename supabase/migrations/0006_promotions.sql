-- XAYVEN — Fase 11B: promotions (núcleo)
--
-- Bitácora de campañas promocionales administrables desde /admin/promotions,
-- sin tocar código. Puramente aditiva — no toca ninguna fila existente de
-- ninguna otra tabla, no agrega columnas a tablas existentes.
--
-- Deliberadamente NO incluye en esta migración (ver la auditoría Fase 11A
-- y el informe de Fase 11B):
--   - promotion_id en conversations/projects — la propia auditoría lo
--     ubicó en una etapa POSTERIOR ("Atribución"), separada del núcleo.
--   - promotion_events / promotion_redemptions — tracking, fase separada.
--   - Cualquier relación hacia clients o payments — explícitamente
--     descartada en la auditoría (ver el informe).
--
-- Solo 4 valores de `status` se ALMACENAN — "active"/"expired" NUNCA se
-- guardan, se calculan en cada lectura a partir de status + start_at +
-- end_at (ver src/lib/promotions/effectiveStatus.ts). Cero cron, cero job
-- periódico: no hay ninguna columna ni trigger aquí que dependa de que algo
-- se ejecute con el tiempo.
--
-- Run via the Supabase SQL editor, or `supabase db push`.

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  name text not null,
  -- Copy real que ve el visitante ("🔥 ¡20% de descuento durante agosto!")
  -- — SIEMPRE escrito a mano por el admin, nunca generado desde
  -- discount_type/discount_value (ver la auditoría §2.4: evita lógica
  -- frágil de plantillas y le da al admin control creativo total).
  text text not null,

  -- Solo 3 valores hoy — mismo patrón de enum-vía-CHECK que ya usan
  -- PaymentType/ProjectStatus/LeadStatus en este proyecto: extensible
  -- agregando un valor nuevo al CHECK, nunca una columna nullable nueva.
  discount_type text not null check (
    discount_type in ('percentage', 'fixed_amount', 'special_price')
  ),
  discount_value numeric not null check (discount_value > 0),
  -- percentage nunca lleva moneda (no tiene sentido); fixed_amount y
  -- special_price SIEMPRE la requieren — nunca un monto de moneda
  -- ambigua, misma disciplina de MoneyByCurrency ya aplicada en todo el
  -- proyecto (payments, projects).
  currency text null,
  constraint promotions_percentage_le_100 check (
    discount_type <> 'percentage' or discount_value <= 100
  ),
  constraint promotions_currency_matches_type check (
    (discount_type = 'percentage' and currency is null)
    or (discount_type <> 'percentage' and currency is not null)
  ),

  start_at timestamptz not null,
  end_at timestamptz not null,
  constraint promotions_end_after_start check (end_at > start_at),

  audience text not null check (
    audience in ('new_users', 'existing_clients', 'all')
  ),

  -- Solo 4 valores ALMACENADOS — "active"/"expired" son siempre
  -- calculados, nunca escritos aquí. Ver el comentario de cabecera.
  status text not null default 'draft' check (
    status in ('draft', 'scheduled', 'paused', 'archived')
  ),

  cta_label text not null,
  -- El mensaje que XAYVEN AI recibirá cuando se conecte el CTA al chat
  -- (fase posterior, NO implementada aquí — ver src/lib/promotions/types.ts).
  -- Nullable: a diferencia de cta_label (el texto del botón, siempre
  -- visible, por eso obligatorio), este campo no tiene ningún consumidor
  -- todavía — exigirlo ahora sería fricción sin beneficio real. Mismo
  -- trato que metadata/audience_rules: reservado, coherente con el resto
  -- del modelo.
  cta_message text null,

  -- Columnas reservadas, sin uso todavía (Fase 11B) — clasificadas "A:
  -- implementar ahora" en la auditoría por ser baratas de agregar hoy y
  -- caras de retrofit después. Ninguna se lee ni se escribe en esta fase;
  -- existen para no bloquear segmentación (audience_rules) ni un futuro
  -- escape hatch estructurado (metadata) sin una migración nueva.
  metadata jsonb not null default '{}'::jsonb,
  audience_rules jsonb null
);

-- Cubre tanto el filtro de pestañas del admin (por status) como
-- getEligibleActivePromotions() (status = 'scheduled' + rango de fechas)
-- en un solo índice compuesto — mismo razonamiento que el índice
-- (to_status, changed_at) de lead_status_history (Fase 9C).
create index if not exists promotions_status_dates_idx
  on public.promotions (status, start_at, end_at);

drop trigger if exists promotions_set_updated_at on public.promotions;
create trigger promotions_set_updated_at
  before update on public.promotions
  for each row execute function public.set_updated_at();

alter table public.promotions enable row level security;
-- Mismo modelo que el resto de tablas administrativas: RLS habilitado,
-- CERO policies — el único acceso real es vía el service role (bypassa
-- RLS por diseño), nunca desde el navegador. La lectura pública de
-- promociones activas (getEligibleActivePromotions) pasa siempre por el
-- servidor, nunca por una policy de "anon puede leer".
