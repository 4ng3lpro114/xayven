-- XAYVEN — Fase 11 Etapa A: atribución Promoción → Conversación
--
-- 0006_promotions.sql excluyó deliberadamente `promotion_id` en
-- conversations/projects del núcleo administrativo, ubicándolo en una
-- etapa posterior ("Atribución"). Esta migración implementa exactamente
-- esa etapa, pero SOLO para conversations (top of funnel) — projects
-- queda fuera a propósito (ver el informe de Etapa A: Promoción →
-- Proyecto es Etapa B, no esta).
--
-- Puramente aditiva. Nullable — la inmensa mayoría de conversaciones
-- nunca se originan desde una promoción. `ON DELETE SET NULL`, mismo
-- patrón exacto que conversations.client_id (0003_lead_to_client.sql):
-- una conversación es un registro histórico que debe sobrevivir aunque la
-- promoción a la que apunta desaparezca alguna vez (hoy las promociones
-- nunca se borran físicamente — solo se archivan — pero la FK se
-- comporta igual de bien si esa regla cambiara).
--
-- NO toca clients, payments, projects ni ninguna policy existente.

alter table public.conversations
  add column if not exists promotion_id uuid references public.promotions(id) on delete set null;

create index if not exists conversations_promotion_id_idx
  on public.conversations (promotion_id);
