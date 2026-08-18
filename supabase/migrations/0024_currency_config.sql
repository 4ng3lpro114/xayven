-- XAYVEN — International Pricing, Fase C: currency_config
--
-- Regla de redondeo comercial por moneda — consumida exclusivamente por
-- la capa de conversión determinista (convertPrice.ts). Nunca se redondea
-- con una regla inventada ad hoc en ningún otro punto del código.
--
-- Sembrada con las 2 monedas ya activas en el sistema (COP, USD) — esto
-- es infraestructura/configuración, no una decisión de precio comercial
-- internacional, por lo que la Regla 11 de Phase A (no seedear precios
-- internacionales definitivos) no aplica aquí.
--
-- Sin dependencias de otras tablas nuevas de International Pricing.

create table if not exists public.currency_config (
  -- Misma moneda que pricing_catalog.currency / pricing_markets.currency
  -- (set cerrado COP/USD hoy).
  currency text primary key,

  -- Redondear al múltiplo más cercano de este valor. COP=1000 (los
  -- montos ya sembrados en pricing_catalog son múltiplos de 1000),
  -- USD=1 (dólares enteros, sin centavos, mismo criterio que el resto
  -- del esquema de dinero: entero, sin decimales).
  rounding_unit integer not null check (rounding_unit > 0),

  -- Solo para presentación futura — los montos en este esquema siempre
  -- se almacenan como enteros, nunca fraccionarios.
  decimal_places integer not null check (decimal_places >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists currency_config_set_updated_at on public.currency_config;
create trigger currency_config_set_updated_at
  before update on public.currency_config
  for each row execute function public.set_updated_at();

alter table public.currency_config enable row level security;
-- RLS habilitado, cero policies — mismo modelo que el resto del esquema.

insert into public.currency_config (currency, rounding_unit, decimal_places)
values
  ('COP', 1000, 0),
  ('USD', 1, 2)
on conflict (currency) do nothing;
