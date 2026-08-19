-- XAYVEN CORE — Phase 1: capture commercial context on contact_requests
--
-- Preserves the exact Commercial Market / Display Currency / official
-- price a visitor had at the moment they submitted "Crear mi proyecto",
-- so an admin looking at a request later can see what the visitor
-- actually saw on screen — not a guess reconstructed afterward from
-- pricing_catalog alone (which is COP-only and ignores Commercial
-- Market/Display Currency entirely — see the CRM audit, section 8).
--
-- Four columns, all nullable, all resolved server-side only (never a
-- client-supplied value — see /api/contact/route.ts):
--   market_code       — pricing_markets.code AT THE TIME of submission
--                        (e.g. 'CO', 'EU', 'US', 'OTHER'). A snapshot,
--                        deliberately NOT a live FK to pricing_markets —
--                        same reasoning as conversations.service_page_slug
--                        (0018_conversations_service_page_slug.sql): what
--                        matters is the historical fact "this request came
--                        from the EU market", which must survive even if
--                        that market is ever deactivated/renamed later.
--   display_currency  — the currency the visitor had selected to view
--                        prices in (xayven_display_currency cookie,
--                        resolved via resolveDisplayCurrency()) — always
--                        captured when a market resolves, independent of
--                        whether a package was selected.
--   official_amount   — the exact commercial amount shown on screen, in
--                        display_currency, as an integer (same "money is
--                        always a whole-unit integer" convention as
--                        pricing_market_prices.price/payments.amount/
--                        projects.total_amount — never a formatted
--                        string). NULL when no package was selected
--                        (no ?plan) or when Pricing Core itself had
--                        nothing to show (e.g. a QUOTE_ONLY item/market).
--   official_currency — the ISO code official_amount is denominated in.
--                        NULL exactly when official_amount is NULL, never
--                        independently.
--
-- Purely additive. Does not touch pricing_catalog_id, status, client_id,
-- client_was_created, or any other existing column/constraint. Every
-- existing row keeps working untouched with all four new columns NULL —
-- the same "no backfill, no invented values" discipline as
-- 0015_contact_requests_pricing_catalog_id.sql.

alter table public.contact_requests
  add column if not exists market_code text null,
  add column if not exists display_currency text null,
  add column if not exists official_amount integer null,
  add column if not exists official_currency text null;

comment on column public.contact_requests.market_code is
  'Snapshot of pricing_markets.code at submission time (resolveCommercialMarket()) — never a live FK, never client-supplied. NULL only for requests created before this column existed.';
comment on column public.contact_requests.display_currency is
  'Snapshot of the visitor''s selected display currency at submission time (resolveDisplayCurrency()) — independent of market_code. NULL only for requests created before this column existed.';
comment on column public.contact_requests.official_amount is
  'The exact commercial amount shown to the visitor, in display_currency, as a whole-unit integer (never a formatted string). NULL when no package was selected or Pricing Core had nothing to show.';
comment on column public.contact_requests.official_currency is
  'ISO currency code official_amount is denominated in — NULL exactly when official_amount is NULL.';
