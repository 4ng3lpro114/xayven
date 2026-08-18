-- XAYVEN — International Pricing, Fase B: market_countries
--
-- Enrutamiento país → mercado. Un país enruta a exactamente un mercado
-- (country_code es PK); un mercado puede tener cero, uno o muchos países
-- enrutados a él. Un país SIN fila aquí no es un error — simplemente
-- resuelve al mercado 'OTHER' (ver getMarketForCountry() en
-- pricingMarketStore.ts). country_code nunca es tratado como sinónimo de
-- currency ni de market — solo como la señal de enrutamiento hacia un
-- market.
--
-- Depende de 0021_pricing_markets.sql (FK).

create table if not exists public.market_countries (
  -- ISO 3166-1 alpha-2, mayúsculas (p.ej. 'US', 'CO', 'DE').
  country_code text primary key,

  -- ON DELETE RESTRICT: un mercado con países enrutados no puede
  -- eliminarse físicamente sin antes reasignar esos países — mismo
  -- principio de "nunca un huérfano silencioso" que el resto del esquema
  -- (en la práctica, los mercados se desactivan vía is_active, nunca se
  -- eliminan; este RESTRICT es la red de seguridad por si alguna vez se
  -- intenta un DELETE manual).
  market_id uuid not null references public.pricing_markets(id) on delete restrict,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists market_countries_set_updated_at on public.market_countries;
create trigger market_countries_set_updated_at
  before update on public.market_countries
  for each row execute function public.set_updated_at();

create index if not exists market_countries_market_id_idx on public.market_countries(market_id);

alter table public.market_countries enable row level security;
-- RLS habilitado, cero policies — mismo modelo que el resto del esquema.

-- Sin semilla — Fase A Regla 11: ningún enrutamiento país→mercado real se
-- define todavía. El único mercado que existe en esta fase es 'OTHER', al
-- que cae cualquier país por definición al no haber ninguna fila aquí.
