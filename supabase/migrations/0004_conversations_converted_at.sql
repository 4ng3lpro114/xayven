-- XAYVEN — Fase 9B (Analytics V2, primer paso): converted_at
--
-- Timestamp histórico de cuándo una conversación (lead) se convirtió en
-- cliente por primera vez. Nullable, SIN default a propósito — las
-- conversaciones existentes quedan en NULL: no existe ningún dato
-- confiable con el que reconstruir esa fecha retroactivamente (ver
-- auditoría Fase 9A, sección D — `updated_at` no sirve de proxy aquí
-- porque una conversación ya convertida puede seguir recibiendo mensajes
-- después, sin ningún guard que la congele, a diferencia de `payments`).
-- Esta migración NO hace ningún backfill — es puramente aditiva y no
-- toca ninguna fila existente.
--
-- Se escribe una sola vez, en src/lib/leads/conversion.ts
-- (convertConversationToClient), en el mismo punto donde ya se escriben
-- client_id y lead_status = 'client' — nunca se sobrescribe si la
-- conversación ya tiene converted_at (idempotencia).
--
-- Run via the Supabase SQL editor, or `supabase db push`.

alter table public.conversations
  add column if not exists converted_at timestamptz null;
