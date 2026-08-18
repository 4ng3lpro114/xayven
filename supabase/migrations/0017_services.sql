-- XAYVEN — Services, Fase 1: catálogo comercial de servicios
--
-- Segunda pieza del dominio comercial, junto a pricing_catalog
-- (0014_pricing_catalog.sql). Puramente aditiva. NO toca pricing_catalog,
-- clients, projects, payments, promotions, profiles ni ninguna policy
-- existente.
--
-- Relación con pricing_catalog: NO es una FK normalizada. Se referencia
-- por `slug` (texto), igual que pricing_catalog.types.ts ya documenta como
-- la intención: "slug is the stable identifier any future relation
-- should reference — never id". Un array de slugs es suficiente para esta
-- relación (baja cardinalidad, un servicio referencia como máximo un
-- puñado de paquetes) — no se justifica una tabla de unión normalizada
-- todavía (ver §57 del prompt maestro: no reescritura/complejidad
-- innecesaria). Un slug que deje de existir en pricing_catalog
-- simplemente no se resuelve en tiempo de render — nunca rompe la carga
-- de la página del servicio.
--
-- Contenido editorial en jsonb (`content_es`/`content_en`) — mismo
-- precedente ya usado por promotions.metadata/audience_rules en este
-- proyecto para datos estructurados que no necesitan columnas propias
-- para ser consultados individualmente. La estructura exacta vive en
-- src/lib/services/types.ts (ServiceContent).
--
-- `is_published` en vez de DELETE físico — mismo principio que
-- pricing_catalog.is_active / promotions archived / Project.published.

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Identificador estable de ruta: /services/[slug]. Nunca cambia una vez
  -- publicado — es lo que usan sitemap.ts, generateStaticParams y
  -- cualquier enlace interno/externo ya indexado.
  slug text not null unique,

  -- Orden de presentación deliberado en /services (no alfabético) — igual
  -- de explícito que el orden ya usado en dict.services.items hoy.
  display_order integer not null default 0,

  -- Igual disciplina que pricing_catalog.is_active / Project.published:
  -- nunca DELETE físico. Un servicio despublicado deja de aparecer en
  -- /services, en el sitemap y en el knowledge de XAYVEN AI, pero su fila
  -- permanece (histórico, enlaces ya indexados devuelven 404 controlado,
  -- no un error de datos faltantes).
  is_published boolean not null default true,

  -- Slugs de pricing_catalog relacionados con este servicio. Puede estar
  -- vacío (servicio sin paquete cerrado, ej. SEO/Automatización — precio
  -- por cotización). Resuelto en runtime contra pricing_catalog, nunca
  -- copiado/duplicado aquí.
  related_package_slugs text[] not null default '{}',

  -- Contenido editorial completo por locale — ver ServiceContent en
  -- src/lib/services/types.ts para la forma exacta (hero, definición,
  -- problema, solución, qué incluye, para quién, casos de uso, FAQ).
  content_es jsonb not null,
  content_en jsonb not null
);

drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

alter table public.services enable row level security;
-- Mismo modelo que pricing_catalog/promotions/clients/projects: RLS
-- habilitado, CERO policies — el único acceso real es vía el service
-- role (bypasa RLS por diseño), nunca desde el navegador. Las páginas
-- públicas de Services leen a través de servicesStore.ts (server-only),
-- nunca con una consulta directa desde el cliente.
