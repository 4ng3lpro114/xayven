-- XAYVEN — Pricing Core, Fase 1: catálogo comercial
--
-- Primera versión real de la fuente de verdad de precios comerciales
-- (ver la auditoría comercial: hoy no existe ninguna — project.totalAmount
-- es un número que un admin escribe a mano, sin catálogo detrás).
--
-- Puramente aditiva. NO toca clients, projects, payments, promotions,
-- profiles ni ninguna policy existente. `projects` NO gana ninguna
-- columna nueva en esta migración — la relación Pricing Core → proyecto
-- es una fase posterior deliberadamente no implementada aquí (ver el
-- informe de diseño): cuando exista, el precio del catálogo se copiará
-- (snapshot) a project.totalAmount al crear el proyecto, nunca una
-- referencia viva — así un proyecto ya creado nunca cambia de precio
-- porque el catálogo cambió después.
--
-- `is_active` en vez de DELETE físico — mismo principio ya aplicado en
-- todo el proyecto (promotions se archivan, clients se despromueven,
-- nunca se borran filas de referencia/histórico).

create table if not exists public.pricing_catalog (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Identificador estable, nunca cambia aunque `name` se ajuste — lo que
  -- una futura relación (projects, promotions) referenciaría.
  slug text not null unique,
  -- Nombre EXACTO tal como debe mostrarse — "Essential"/"Growth"/"Care+"
  -- son nombres oficiales que deben preservarse literalmente.
  name text not null,

  -- 'package' = los 5 paquetes de creación web (START..CUSTOM).
  -- 'maintenance' = los 3 planes de mantenimiento (Essential/Growth/Care+).
  -- Enum vía CHECK, mismo patrón ya usado por PaymentType/ProjectStatus/
  -- LeadStatus/PromotionStatus en este proyecto — extensible agregando un
  -- valor nuevo al CHECK, nunca una columna nullable nueva.
  category text not null check (category in ('package', 'maintenance')),

  -- Pago único (los 5 paquetes) vs. mensual (los 3 planes).
  billing_interval text not null check (billing_interval in ('ONE_TIME', 'MONTHLY')),

  -- FIXED = precio cerrado (START, PROFESSIONAL, BUSINESS, Essential,
  -- Growth, Care+). FROM = precio "desde" (E-COMMERCE, CUSTOM) — nunca se
  -- trata como obligatorio, es un piso informativo.
  price_type text not null check (price_type in ('FIXED', 'FROM')),

  -- Mismo tipo que projects.total_amount/payments.amount (integer, sin
  -- decimales) — consistencia con el resto del esquema de dinero.
  base_price integer not null check (base_price > 0),
  currency text not null default 'COP',

  -- Nunca DELETE físico — desactivar un servicio del catálogo no debe
  -- borrar el registro que un proyecto histórico pudiera llegar a
  -- referenciar en el futuro.
  is_active boolean not null default true
);

drop trigger if exists pricing_catalog_set_updated_at on public.pricing_catalog;
create trigger pricing_catalog_set_updated_at
  before update on public.pricing_catalog
  for each row execute function public.set_updated_at();

alter table public.pricing_catalog enable row level security;
-- Mismo modelo que promotions/clients/projects: RLS habilitado, CERO
-- policies — el único acceso real es vía el service role (bypasa RLS por
-- diseño), nunca desde el navegador.

-- ---------------------------------------------------------------------------
-- Semilla — exactamente los 8 productos iniciales autorizados, ni uno más.
-- ON CONFLICT (slug) DO NOTHING: aplicar esta migración dos veces (o sobre
-- un catálogo ya sembrado manualmente) nunca duplica ni sobreescribe filas.
-- ---------------------------------------------------------------------------
insert into public.pricing_catalog (slug, name, category, billing_interval, price_type, base_price, currency)
values
  ('start',        'START',        'package',     'ONE_TIME', 'FIXED', 799000,   'COP'),
  ('professional',  'PROFESSIONAL', 'package',     'ONE_TIME', 'FIXED', 1499000,  'COP'),
  ('business',      'BUSINESS',     'package',     'ONE_TIME', 'FIXED', 2499000,  'COP'),
  ('ecommerce',      'E-COMMERCE',   'package',     'ONE_TIME', 'FROM',  3499000,  'COP'),
  ('custom',         'CUSTOM',       'package',     'ONE_TIME', 'FROM',  6000000,  'COP'),
  ('essential',      'Essential',    'maintenance', 'MONTHLY',  'FIXED', 149000,   'COP'),
  ('growth',         'Growth',       'maintenance', 'MONTHLY',  'FIXED', 299000,   'COP'),
  ('care-plus',      'Care+',        'maintenance', 'MONTHLY',  'FIXED', 499000,   'COP')
on conflict (slug) do nothing;
