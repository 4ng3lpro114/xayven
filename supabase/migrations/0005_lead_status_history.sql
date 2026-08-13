-- XAYVEN — Fase 9C (Analytics V2): lead_status_history
--
-- Bitácora de transiciones reales de conversations.lead_status. Aditiva y
-- puramente estructural — no toca ninguna fila existente de `conversations`
-- ni de ninguna otra tabla. La tabla queda vacía al aplicarse: NO hay
-- backfill ni eventos sintéticos para conversaciones ya existentes (ver
-- auditoría Fase 9C, secciones I/J) — el primer evento de cada conversación
-- será su primera transición real posterior a esta migración.
--
-- Se escribe exclusivamente desde src/lib/leads/leadStatus.ts
-- (changeLeadStatus) — la única función autorizada para cambiar
-- conversations.lead_status en todo el código (ver auditoría Fase 9C).
--
-- Run via the Supabase SQL editor, or `supabase db push`.

create table if not exists public.lead_status_history (
  id uuid primary key default gen_random_uuid(),

  conversation_id uuid not null references public.conversations(id) on delete cascade,

  -- Snapshot del client_id en el momento del cambio — sobrevive aunque el
  -- cliente se borre después (mismo patrón ON DELETE SET NULL que ya usa
  -- conversations.client_id, por la misma razón: preservar el registro
  -- histórico aunque el cliente al que apuntaba ya no exista).
  client_id uuid null references public.clients(id) on delete set null,

  -- Mismos 5 valores reales de LeadStatus (src/lib/db/types.ts) — nada
  -- inventado. from_status es null solo conceptualmente (nunca se usa en
  -- la práctica, ver auditoría §K: no se registra un evento de "creación").
  from_status text null check (
    from_status is null or from_status in ('exploring', 'interested', 'hot', 'client', 'support')
  ),
  to_status text not null check (
    to_status in ('exploring', 'interested', 'hot', 'client', 'support')
  ),

  changed_at timestamptz not null default now(),

  changed_by text not null check (changed_by in ('ai', 'admin', 'system')),

  -- Mecanismo exacto que produjo el cambio — más específico que changed_by,
  -- permite distinguir p. ej. una edición manual de admin de la conversión
  -- oficial (ambas son "admin"). Los 3 valores son los únicos puntos de
  -- escritura reales que existen hoy (ver auditoría Fase 9C §B).
  source text not null check (
    source in ('ai_chat_turn', 'admin_manual_status_change', 'lead_conversion')
  ),

  metadata jsonb not null default '{}'::jsonb
);

-- (conversation_id, changed_at): historial ordenado de una conversación.
create index if not exists lead_status_history_conversation_changed_idx
  on public.lead_status_history (conversation_id, changed_at);

-- (client_id): historial de un cliente ya convertido, sin pasar por conversations.
create index if not exists lead_status_history_client_id_idx
  on public.lead_status_history (client_id);

-- (to_status, changed_at) en vez de un índice plano en (to_status): sirve
-- igual de bien a consultas "por to_status" (usa el prefijo) y además
-- soporta directamente las consultas de series temporales por estado
-- ("conversiones por mes") que son el motivo real de esta tabla — un
-- índice adicional solo en (changed_at) no aporta nada que este no cubra
-- ya para los accesos que XAYVEN necesita.
create index if not exists lead_status_history_to_status_changed_idx
  on public.lead_status_history (to_status, changed_at);

alter table public.lead_status_history enable row level security;
-- Mismo modelo que el resto de tablas administrativas: RLS habilitado,
-- CERO policies — el único acceso real es vía el service role (bypassa
-- RLS por diseño), nunca desde el navegador.
