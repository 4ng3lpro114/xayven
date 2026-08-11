-- XAYVEN V1.1 — AI assistant + lead intelligence + maintenance requests
--
-- This schema is intentionally minimal: two tables, no joins, no client-facing
-- access. Everything is written/read exclusively by the Next.js server using
-- the Supabase *service role* key (never exposed to the browser), which
-- bypasses Row Level Security by design — so RLS here exists as a hard
-- safety net against any future misconfiguration (e.g. an anon key leaking
-- into client code), not as the primary access control mechanism.
--
-- Run via the Supabase SQL editor, or `supabase db push` if you use the CLI.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- conversations — one row per XAYVEN AI chat session
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  locale text not null default 'es' check (locale in ('es', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'closed')),

  -- Ordered array of { role: 'user' | 'assistant', content: string, createdAt: string }
  messages jsonb not null default '[]'::jsonb,

  -- Progressively captured visitor context — all optional by design (see
  -- Fase 3: never front-load a form, only fill in what the AI detects).
  visitor_name text,
  visitor_email text,
  visitor_phone text,
  company text,
  website text,
  project_type text,
  need text,
  goal text,
  budget text,
  urgency text,

  -- Lead intelligence
  lead_score integer not null default 0 check (lead_score between 0 and 100),
  lead_status text not null default 'exploring'
    check (lead_status in ('exploring', 'interested', 'hot', 'client', 'support')),
  ai_summary text,

  -- Privacy: whether the visitor has been informed / consented to having
  -- this conversation stored. See /privacy.
  consent_status text not null default 'pending'
    check (consent_status in ('pending', 'granted', 'declined'))
);

create index if not exists conversations_session_id_idx on public.conversations (session_id);
create index if not exists conversations_lead_status_idx on public.conversations (lead_status);
create index if not exists conversations_created_at_idx on public.conversations (created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;
-- No policies are granted here on purpose: anon/authenticated roles get
-- zero access. Only the service role (server-side only) can read/write.

-- ---------------------------------------------------------------------------
-- maintenance_requests — submissions from /[locale]/maintenance
-- ---------------------------------------------------------------------------
create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  company text,
  website text not null,
  need text not null,
  priority text not null,
  message text not null,
  status text not null default 'new' check (status in ('new', 'contacted', 'resolved'))
);

create index if not exists maintenance_requests_created_at_idx
  on public.maintenance_requests (created_at desc);

alter table public.maintenance_requests enable row level security;
-- Same policy stance as above: server (service role) only.

-- ---------------------------------------------------------------------------
-- Forward-looking note (not implemented yet — see README "V1.2 / future"):
-- once client accounts exist, add a `user_id uuid references auth.users`
-- column to `conversations` and a policy like:
--   create policy "clients read own conversations" on public.conversations
--     for select using (auth.uid() = user_id);
-- ---------------------------------------------------------------------------
