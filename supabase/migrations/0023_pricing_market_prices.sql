-- XAYVEN — International Pricing, Fase B: pricing_market_prices
--
-- El precio oficial de UN item de pricing_catalog en UN mercado. Esta es
-- la tabla que reemplaza por completo el modelo por-moneda descartado en
-- Phase A Revision 2 — nunca existió aplicada, no requiere migración de
-- datos, solo reemplaza el diseño antes de implementarse.
--
-- currency es una copia denormalizada de pricing_markets.currency en el
-- momento de la escritura — validada en pricingMarketStore.ts en cada
-- creación (createPricingMarketPrice) para que nunca pueda divergir de la
-- moneda real de su propio mercado; nunca editable de forma independiente
-- después de creada (ver market/validation.ts).
--
-- Depende de 0014_pricing_catalog.sql y 0021_pricing_markets.sql (FKs).
-- Fase A Regla 11: sin semilla — ningún precio internacional comercial
-- definitivo se siembra en esta fase.

create table if not exists public.pricing_market_prices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  pricing_catalog_id uuid not null references public.pricing_catalog(id) on delete restrict,
  market_id uuid not null references public.pricing_markets(id) on delete restrict,

  currency text not null,

  -- Puede diferir del price_type base del item (p.ej. base FIXED, un
  -- override de mercado FROM) — es una decisión comercial propia de ese
  -- mercado, no heredada ciegamente.
  price_type text not null check (price_type in ('FIXED', 'FROM')),
  price integer not null check (price > 0),

  -- Nunca DELETE físico — mismo principio que pricing_catalog.is_active.
  is_active boolean not null default true,

  -- Cuándo se volvió el precio oficial — distinto de created_at para que
  -- un futuro cambio de precio programado/retroactivo tenga dónde vivir
  -- sin reescribir historia.
  effective_at timestamptz not null default now(),

  -- Un item solo puede tener UN precio oficial activo por mercado —
  -- unicidad estructural, no solo una convención de la app.
  unique (pricing_catalog_id, market_id)
);

drop trigger if exists pricing_market_prices_set_updated_at on public.pricing_market_prices;
create trigger pricing_market_prices_set_updated_at
  before update on public.pricing_market_prices
  for each row execute function public.set_updated_at();

create index if not exists pricing_market_prices_catalog_idx on public.pricing_market_prices(pricing_catalog_id);
create index if not exists pricing_market_prices_market_idx on public.pricing_market_prices(market_id);

alter table public.pricing_market_prices enable row level security;
-- RLS habilitado, cero policies — mismo modelo que el resto del esquema.
