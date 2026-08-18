-- XAYVEN — International Pricing, Fase B: pricing_markets
--
-- Ver XAYVEN_INTERNATIONAL_PRICING_AI_ARCHITECTURE.md (Phase A, aprobado)
-- para el diseño completo. MARKET es la clave comercial — nunca country,
-- nunca currency. Un mercado tiene exactamente una moneda; varios mercados
-- pueden compartir moneda con precios oficiales distintos.
--
-- Puramente aditiva. NO toca pricing_catalog, projects, payments,
-- promotions, profiles ni ninguna policy existente.
--
-- Depende de que 0014_pricing_catalog.sql exista conceptualmente primero
-- (mismo dominio), aunque esta tabla en sí no tiene FK hacia
-- pricing_catalog — esa relación vive en pricing_market_prices
-- (0023), no aquí.

create table if not exists public.pricing_markets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Identificador estable definido por Admin — p.ej. 'US', 'ES', 'DE',
  -- 'CO', 'OTHER'. NUNCA se asume igual a un country code ni a una
  -- currency — ver la relación country → market → currency en el
  -- documento de diseño.
  code text not null unique,
  name text not null,

  -- Exactamente una moneda por mercado. Mismo set cerrado que
  -- pricing_catalog.currency hoy (COP/USD); ampliar requiere el mismo
  -- ejercicio explícito de ampliar un CHECK, nunca una columna libre.
  currency text not null,

  -- Decisión comercial explícita — nunca implícita. Por defecto false:
  -- el sistema nunca asume permiso para convertir dinámicamente. Fase C
  -- es quien realmente implementa la conversión; este flag solo la
  -- autoriza por mercado.
  conversion_allowed boolean not null default false,

  -- Solo se consulta cuando no hay precio oficial Y la conversión no está
  -- permitida (o, en Fase B, la conversión simplemente no existe todavía
  -- — ver resolveOfficialPrice.ts).
  --   QUOTE_ONLY     → no se muestra ningún precio, se ofrece cotización.
  --   BASE_REFERENCE → se muestra el precio base COP, explícitamente
  --                    como referencia, nunca como precio a cobrar.
  fallback_behavior text not null default 'QUOTE_ONLY'
    check (fallback_behavior in ('QUOTE_ONLY', 'BASE_REFERENCE')),

  -- Nunca DELETE físico — mismo principio que pricing_catalog.is_active.
  is_active boolean not null default true
);

drop trigger if exists pricing_markets_set_updated_at on public.pricing_markets;
create trigger pricing_markets_set_updated_at
  before update on public.pricing_markets
  for each row execute function public.set_updated_at();

alter table public.pricing_markets enable row level security;
-- Mismo modelo que pricing_catalog/promotions/clients/projects: RLS
-- habilitado, CERO policies — el único acceso real es vía el service
-- role (bypasa RLS por diseño), nunca desde el navegador.

-- ---------------------------------------------------------------------------
-- Semilla — ÚNICAMENTE el mercado de seguridad 'OTHER', al que cae
-- cualquier país sin mercado asignado (ver market_countries, 0022, y
-- resolveOfficialPrice.ts). Fase A Regla 11: NO se siembra ningún precio
-- internacional comercial definitivo en esta fase — 'OTHER' no es un
-- precio, es la red de seguridad que garantiza que el resolver siempre
-- tiene un mercado válido al que caer.
--
-- Fase D: fallback_behavior es BASE_REFERENCE, no QUOTE_ONLY (valor con el
-- que Fase B originalmente lo sembró). No es un precio internacional
-- nuevo — la moneda de 'OTHER' es COP, así que BASE_REFERENCE aquí solo
-- significa "mostrar pricing_catalog.base_price", el mismo número ya
-- público en el sitio hoy. Evita que un visitante cuyo mercado no se
-- pudo determinar vea el sitio sin ningún precio hasta que existan
-- mercados reales configurados.
-- ---------------------------------------------------------------------------
insert into public.pricing_markets (code, name, currency, conversion_allowed, fallback_behavior)
values
  ('OTHER', 'Other markets (unassigned)', 'COP', false, 'BASE_REFERENCE')
on conflict (code) do nothing;
