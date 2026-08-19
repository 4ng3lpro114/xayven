-- XAYVEN CORE — Phase 3.6: client_notes
--
-- Free-text internal notes an admin can leave on a client — the concrete
-- gap identified by the Phase 3.6 CRM/Admin audit: none of the existing
-- entities (conversations, projects, payments, contact_requests,
-- maintenance_requests) let an admin record something that didn't already
-- generate a row on its own (a call, a manual follow-up, context worth
-- keeping). Deliberately minimal — create/list/delete only, no edit, no
-- author column (this project has a single shared admin credential, no
-- multi-user auth yet — see src/lib/auth/admin.ts — so an author_id would
-- have nothing real to reference).
--
-- ON DELETE CASCADE (unlike conversations.client_id/contact_requests.
-- client_id/maintenance_requests.client_id, which are all ON DELETE SET
-- NULL): those three are independent historical records with meaning of
-- their own even if the client they point to is later deleted. A
-- client_note has no such independent meaning — it's authored ABOUT that
-- client, so it should be removed together with it, never orphaned.
--
-- Same RLS posture as every other table in this project: enabled, zero
-- policies granted to anon/authenticated — only the Next.js server, via
-- the Supabase service role (which bypasses RLS by design), can read or
-- write. RLS here is a safety net against future misconfiguration, not
-- the primary access boundary — see 0001_init.sql's comment for the same
-- reasoning applied project-wide.
--
-- Run via the Supabase SQL editor, or `supabase db push`.

create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid not null references public.clients(id) on delete cascade,
  body text not null
);

-- (client_id, created_at desc): the only real access pattern this table
-- has — "this client's notes, newest first" — see listClientNotes()
-- (src/lib/db/clientNoteStore.ts).
create index if not exists client_notes_client_id_idx
  on public.client_notes (client_id, created_at desc);

alter table public.client_notes enable row level security;
