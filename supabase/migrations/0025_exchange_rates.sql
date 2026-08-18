-- XAYVEN — International Pricing, Fase C: exchange_rates
--
-- Caché histórico de tasas de cambio, APPEND-ONLY: una fila nunca se
-- modifica después de insertada, solo queda superada por una fila más
-- reciente con un fetched_at posterior. Por eso esta tabla, a diferencia
-- de casi todo el resto del esquema, NO tiene updated_at ni trigger de
-- set_updated_at() — no hay UPDATEs que interceptar.
--
-- Fase C NO conecta ningún proveedor externo de tipo de cambio — esa es
-- una decisión pendiente de aprobación explícita por separado (ver el
-- documento de diseño, Phase A). Esta tabla nace sin semilla: ninguna
-- tasa real existe todavía. `recordExchangeRate()` (exchangeRateStore.ts)
-- es el único punto de entrada de datos, listo para que una futura
-- integración (o una carga manual de Admin) lo use sin que
-- resolveOfficialPrice() tenga que cambiar.
--
-- Sin dependencias de otras tablas nuevas de International Pricing.

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),

  -- Siempre 'COP' en este sistema — pricing_catalog.basePrice es siempre
  -- COP (ver Pricing Core) — explícito en vez de asumido, por si un
  -- futuro escenario multi-base lo necesitara sin cambiar el esquema.
  base_currency text not null default 'COP',
  quote_currency text not null,

  -- Cuántas unidades de quote_currency equivalen a 1 unidad de
  -- base_currency. amount_destino = amount_base_COP * rate.
  rate numeric not null check (rate > 0),

  -- De dónde vino esta observación. Fase C solo registra entradas
  -- manuales/de prueba — nunca "openai"/"anthropic" ni ningún proveedor
  -- de IA, y ningún proveedor externo real todavía (ver nota arriba).
  source text not null,

  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists exchange_rates_lookup_idx
  on public.exchange_rates(base_currency, quote_currency, fetched_at desc);

alter table public.exchange_rates enable row level security;
-- RLS habilitado, cero policies — mismo modelo que el resto del esquema.

-- Sin semilla — ninguna tasa de cambio real existe todavía en esta fase.
