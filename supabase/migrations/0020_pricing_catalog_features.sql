-- XAYVEN — Pre-Production Correction R1: fuente única de verdad para
-- Maintenance (Essential/Growth/Care+).
--
-- Hasta esta migración, un plan de mantenimiento tenía DOS fuentes: el
-- precio en pricing_catalog, y sus "features" (qué incluye) en
-- dict.maintenance.plans — administrable por Admin la primera, editable
-- solo por deploy de código la segunda. Esta migración elimina esa
-- duplicación reutilizando pricing_catalog directamente (nunca se creó
-- una entidad nueva) — mismo principio ya usado en todo este esquema:
-- text[] plano, no jsonb (services.related_package_slugs ya usa este
-- mismo patrón), consistente con que pricing_catalog es hoy 100%
-- relacional/plano, sin ninguna columna jsonb todavía.
--
-- Dos columnas, una por locale — no una sola columna jsonb {es:[],en:[]}:
-- mismo razonamiento que separar content_es/content_en en
-- 0017_services.sql en vez de un solo jsonb con ambos idiomas adentro.
--
-- Puramente aditiva. Nullable con default '{}' — los 5 paquetes web
-- (category='package') no tienen features administrables todavía (esa
-- necesidad no existe: su "qué incluye" vive en cada Service.content.
-- includes correspondiente) y quedan con arrays vacíos, sin romper nada.
--
-- Backfill incluido en esta misma migración para los 3 planes reales —
-- exactamente el mismo texto que hoy vive en dict.maintenance.plans
-- (es.ts/en.ts), movido aquí, no reinventado.

alter table public.pricing_catalog
  add column if not exists features_es text[] not null default '{}',
  add column if not exists features_en text[] not null default '{}';

update public.pricing_catalog set
  features_es = array[
    'Actualizaciones técnicas y de seguridad',
    'Monitoreo de disponibilidad',
    'Copias de seguridad periódicas',
    'Soporte por correo'
  ],
  features_en = array[
    'Technical and security updates',
    'Uptime monitoring',
    'Regular backups',
    'Email support'
  ]
where slug = 'essential';

update public.pricing_catalog set
  features_es = array[
    'Todo lo de Essential',
    'Cambios de contenido periódicos',
    'Optimización de velocidad',
    'Revisión SEO básica recurrente'
  ],
  features_en = array[
    'Everything in Essential',
    'Regular content updates',
    'Speed optimization',
    'Recurring basic SEO review'
  ]
where slug = 'growth';

update public.pricing_catalog set
  features_es = array[
    'Todo lo de Growth',
    'Prioridad de respuesta',
    'Nuevas secciones o funcionalidades pequeñas',
    'Acompañamiento estratégico periódico'
  ],
  features_en = array[
    'Everything in Growth',
    'Priority response',
    'New sections or small features',
    'Recurring strategic check-ins'
  ]
where slug = 'care-plus';
