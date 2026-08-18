-- Fase 2 — Pricing Core → Project Request.
--
-- Adds a single nullable FK from contact_requests to pricing_catalog.
-- Purely additive: no column is renamed, dropped, or made NOT NULL, so
-- every existing row keeps working untouched with pricing_catalog_id = NULL.
--
-- NULL is not an error state here — it means "no package was selected when
-- this request was submitted" (Flujo B: personalized proposal entry point,
-- or Flujo C: direct /contact visit). Only Flujo A (arrives with a plan
-- resolved server-side against the real catalog) ever sets this column.
--
-- ON DELETE SET NULL mirrors contact_requests.client_id's existing
-- discipline: contact_requests is a historical record and must never be
-- deleted just because something it references later is. If a
-- pricing_catalog row is ever hard-deleted (it shouldn't be — see
-- pricing_catalog.is_active's soft-delete convention), the request survives
-- with this field cleared rather than the row vanishing or the FK blocking
-- the delete.
alter table public.contact_requests
  add column pricing_catalog_id uuid null references public.pricing_catalog(id) on delete set null;

comment on column public.contact_requests.pricing_catalog_id is
  'Resolved server-side against pricing_catalog at submission time — never trust a client-supplied slug/id directly. NULL means no package was selected (personalized-proposal entry point or a direct /contact visit), not an error.';
