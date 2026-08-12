-- XAYVEN — Lead → Client conversion (Fase 1: schema)
--
-- Two additive, backward-compatible changes needed to convert a
-- conversation (lead) into a permanent client record without ever losing
-- the AI-gathered context (company, budget, urgency, projectType, need,
-- goal, aiSummary, the full message history — all of that stays on
-- `conversations`, on purpose; see src/lib/leads/conversion.ts).
--
-- Run via the Supabase SQL editor, or `supabase db push`.

-- ---------------------------------------------------------------------------
-- conversations.client_id — permanent link from a lead to the client it
-- became, once (and if) someone converts it.
--
-- Nullable: the overwhelming majority of conversations never convert.
--
-- ON DELETE SET NULL (unlike the payments FKs in 0002_payments.sql, which
-- are all RESTRICT) is deliberate here: a conversation is a historical
-- record that must survive even if the client row it points to is ever
-- deleted. Losing the link is acceptable; losing the conversation itself
-- is not — that would defeat the entire point of preserving lead context.
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column if not exists client_id uuid references public.clients(id) on delete set null;

create index if not exists conversations_client_id_idx
  on public.conversations (client_id);

-- ---------------------------------------------------------------------------
-- clients — case/whitespace-insensitive uniqueness on email.
--
-- Lets the lead-conversion flow (and anything else that creates clients
-- later) reliably find-or-create by email without ever risking a duplicate
-- under a race — two concurrent conversions for the same normalized email
-- will have exactly one of them hit this constraint (23505), which the
-- application layer recovers from explicitly (see
-- paymentsStore.ts `createClientOrGetExisting`) rather than silently
-- allowing a duplicate row.
--
-- Confirmed safe to add: a read-only audit run before this migration found
-- 0 rows in `clients` (and therefore 0 duplicate/empty emails) in this
-- project, so this cannot fail against existing data.
--
-- `clients_email_idx` (plain, non-unique, from 0002_payments.sql) is left
-- in place on purpose — it still serves plain equality lookups by exact
-- email, while this new index is specifically for the normalized
-- uniqueness guarantee. They serve different purposes, not the same one.
-- ---------------------------------------------------------------------------
create unique index if not exists clients_email_normalized_unique_idx
  on public.clients (lower(trim(email)));
