-- XAYVEN — Services Phase 3: atribución Servicio → Conversación
--
-- Mismo patrón exacto que 0013_conversations_promotion_id.sql, para el
-- mismo propósito: saber desde qué página de servicio (/services/[slug])
-- se originó una conversación con XAYVEN AI.
--
-- Deliberadamente TEXT, no una FK a public.services(id): lo que importa
-- conservar es el hecho histórico "esta conversación empezó en
-- /services/seo", no una referencia viva a la fila de servicio — el
-- propio services/types.ts ya documenta que `slug` (no `id`) es el
-- identificador estable que cualquier relación futura debe usar. Si el
-- servicio se despublica, se renombra su slug o incluso se borra su fila
-- más adelante, el dato de atribución de esta conversación debe
-- sobrevivir intacto — el mismo principio que ya rige
-- relatedPackageSlugs en 0017_services.sql.
--
-- Puramente aditiva. Nullable — la inmensa mayoría de conversaciones no
-- se originan desde una página de servicio. NO toca clients, payments,
-- projects, promotions ni ninguna policy existente.

alter table public.conversations
  add column if not exists service_page_slug text;

create index if not exists conversations_service_page_slug_idx
  on public.conversations (service_page_slug);
