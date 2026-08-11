-- XAYVEN — Payments (Wompi primary, PayPal prepared, Wise manual)
--
-- Same access model as 0001_init.sql: every table has RLS enabled with
-- ZERO policies granted to anon/authenticated. Only the Next.js server,
-- using the Supabase *service role* key, can read or write — that key
-- bypasses RLS by design and never reaches the browser. RLS here is a
-- safety net against future misconfiguration, not the primary boundary.
--
-- Money is stored as an integer number of whole currency units (COP has no
-- meaningful fractional subunit in everyday use). Cents-conversion for the
-- Wompi API happens only at the provider boundary — see
-- src/lib/payments/providers/wompi.ts — so this schema stays provider-agnostic.
--
-- Run via the Supabase SQL editor, or `supabase db push`.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text
);

create index if not exists clients_email_idx on public.clients (email);

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

alter table public.clients enable row level security;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_id uuid not null references public.clients(id) on delete restrict,
  name text not null,
  status text not null default 'lead' check (
    status in (
      'lead', 'proposal', 'awaiting_payment', 'active', 'in_progress',
      'review', 'completed', 'maintenance', 'cancelled'
    )
  ),
  currency text not null default 'COP',
  total_amount integer not null check (total_amount >= 0),
  paid_amount integer not null default 0 check (paid_amount >= 0),

  -- Opaque, unguessable capability token for the client portal
  -- (/[locale]/portal/[token]) — this is XAYVEN's V1 client-area "auth":
  -- no password, just a long random secret URL shared with the client.
  -- See docs/payments.md "Client area authentication" for the tradeoffs
  -- and the planned upgrade path to real per-client accounts.
  portal_token text not null unique,

  constraint projects_paid_not_over_total check (paid_amount <= total_amount)
);

create index if not exists projects_client_id_idx on public.projects (client_id);
create index if not exists projects_status_idx on public.projects (status);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

alter table public.projects enable row level security;

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,

  provider text not null check (provider in ('WOMPI', 'PAYPAL', 'WISE')),
  provider_transaction_id text,

  -- Unique per attempt — see src/lib/payments/reference.ts. Never reused
  -- across two different payments, even after DECLINED/ERROR (a retry
  -- creates a fresh reference + fresh Payment row).
  reference text not null unique,

  amount integer not null check (amount > 0),
  currency text not null default 'COP',

  status text not null default 'PENDING' check (
    status in ('PENDING', 'APPROVED', 'DECLINED', 'ERROR', 'VOIDED', 'REFUNDED')
  ),
  payment_type text not null check (
    payment_type in ('DEPOSIT', 'BALANCE', 'FULL_PAYMENT', 'MAINTENANCE')
  ),

  -- Provider-specific extras (e.g. Wompi payment_method_type, Wise transfer
  -- proof reference) — never secrets; see notes in 0001_init.sql on why
  -- that's safe to assert here (the payload never contains our secrets).
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists payments_project_id_idx on public.payments (project_id);
create index if not exists payments_client_id_idx on public.payments (client_id);
create index if not exists payments_status_idx on public.payments (status);

-- A given provider transaction id must map to exactly one payment. NULLs
-- (payments that never reached the provider) are allowed to repeat.
create unique index if not exists payments_provider_txn_unique
  on public.payments (provider, provider_transaction_id)
  where provider_transaction_id is not null;

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.payments enable row level security;

-- ---------------------------------------------------------------------------
-- payment_webhook_events — idempotency ledger for provider webhooks
-- ---------------------------------------------------------------------------
create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  provider text not null,
  provider_transaction_id text not null,
  status text not null,

  -- provider + transaction id + status, e.g. "WOMPI:15loz4-...:APPROVED".
  -- The same transition arriving twice (Wompi retries webhooks) hits this
  -- unique constraint and is treated as an idempotent no-op — see
  -- src/lib/payments/service.ts.
  dedup_key text not null unique,

  payload jsonb not null default '{}'::jsonb
);

create index if not exists payment_webhook_events_txn_idx
  on public.payment_webhook_events (provider, provider_transaction_id);

alter table public.payment_webhook_events enable row level security;

-- ---------------------------------------------------------------------------
-- Forward-looking note (not implemented yet — see docs/payments.md):
-- when real per-client accounts exist (Supabase Auth), add
-- `owner_user_id uuid references auth.users` to `projects` and replace the
-- portal_token model with policies like:
--   create policy "clients read own projects" on public.projects
--     for select using (auth.uid() = owner_user_id);
-- ---------------------------------------------------------------------------
