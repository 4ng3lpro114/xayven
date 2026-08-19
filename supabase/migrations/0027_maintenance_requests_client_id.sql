-- XAYVEN CORE — Phase 2: link maintenance_requests to clients
--
-- Closes the gap the Phase 2 architecture audit found: a maintenance
-- request (support for someone who may already be a commercial client)
-- had no relation to `clients` at all — confirmed both in the schema
-- (0001_init.sql never added one) and in code
-- (src/lib/clients/activity.ts's own comment: "maintenance_requests no
-- tiene relación con clients"). /admin/clients/[id] has literally shown a
-- hardcoded "Mantenimiento no vinculado" placeholder because of this.
--
-- One nullable column, one FK, one index. Purely additive — no existing
-- row is touched or backfilled; every row created before this migration
-- keeps client_id = NULL, same "no invented values" discipline as
-- 0015_contact_requests_pricing_catalog_id.sql / 0026_contact_requests_commercial_context.sql.
--
-- Resolved server-side ONLY, via a best-effort normalized-email lookup
-- against `clients` (see POST /api/maintenance) — NEVER auto-creates a
-- client. Someone can request maintenance before ever becoming a
-- commercial client; the absence of a match is not an error and must
-- never block the request from being saved.
--
-- ON DELETE SET NULL mirrors contact_requests.client_id
-- (0007_contact_requests.sql) and conversations.client_id
-- (0003_lead_to_client.sql) exactly: a maintenance request is a
-- historical support record that must survive even if the client it
-- points to is later deleted.

alter table public.maintenance_requests
  add column if not exists client_id uuid null references public.clients(id) on delete set null;

create index if not exists maintenance_requests_client_id_idx
  on public.maintenance_requests (client_id);

comment on column public.maintenance_requests.client_id is
  'Best-effort match against clients by normalized email, resolved server-side at submission time (POST /api/maintenance) — never a client-supplied value, never auto-creates a client. NULL means no match was found, the lookup failed (non-blocking), or this request predates this column — never distinguished.';
