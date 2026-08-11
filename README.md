# XAYVEN — Digital Studio

**V1.2** of the official XAYVEN site — a bilingual (ES/EN), conversion-focused
marketing site that has grown into a first commercial platform: an AI sales
assistant, lead capture + scoring, a maintenance line of business, an
interactive diagnosis tool, a WhatsApp entry point, a private admin panel,
and — new in this phase — a **payments system** (Wompi, PayPal, Wise) with a
token-gated client portal. Built with Next.js 16 (App Router), TypeScript
and Tailwind CSS v4.

**Payments live in Sandbox only.** See **[docs/payments.md](docs/payments.md)**
for the full architecture, env vars, webhook setup, security model, testing
steps, and the production checklist — this README only summarizes it below.

## Getting started

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` — it redirects to `/es` (default locale) or
`/en` depending on your browser language / a previously chosen language.

Everything runs and builds with **zero configuration** — AI chat, database
persistence, WhatsApp and the admin panel all degrade to an honest "not
configured" state instead of breaking. See "What works without configuration"
below for exactly what that looks like.

## Environment variables

Copy `.env.example` to `.env.local` and fill in what you need — every group
below is optional and independently gated:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Absolute base URL for canonical links, hreflang, sitemap.xml, OG images. Defaults to `https://xayven.com`. |
| `RESEND_API_KEY`, `CONTACT_EMAIL_TO`, `CONTACT_EMAIL_FROM` | Email delivery for `/api/contact` and `/api/maintenance` via [Resend](https://resend.com). |
| `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` | XAYVEN AI. Any OpenAI-compatible `/chat/completions` endpoint. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Persistence for conversations & maintenance requests. Server-only — never exposed to the browser. |
| `WHATSAPP_NUMBER` | Digits-only international number. Floating button is hidden until set. |
| `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET` | `/admin` login. Generate with `node scripts/hash-password.mjs "..."`. |
| `WOMPI_ENV`, `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET` | Payments (Colombia). **Sandbox only in this phase.** See [docs/payments.md](docs/payments.md). |
| `PAYPAL_ENV`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` | Payments (international). **Sandbox only.** See [docs/payments.md](docs/payments.md). |
| `WISE_TRANSFER_INSTRUCTIONS` | Bank transfer instructions text shown to clients — not a credential. |

## What works without any configuration

- The entire public site (home, work, services, process, maintenance,
  diagnosis, about, contact, privacy) — fully bilingual, fully styled.
- The diagnosis tool (pure rule-based, no AI needed).
- The contact and maintenance forms — validated, submitted, logged
  server-side; maintenance requests are also saved via the in-memory store.
- The XAYVEN AI chat bubble **renders** and opens, but shows the
  `notConfiguredTitle`/`notConfiguredBody` message instead of a chat, because
  there's no `AI_API_KEY`.
- The WhatsApp button **does not render** (no broken link) — there's no
  `WHATSAPP_NUMBER`.
- `/admin/login` **renders** but tells you the panel isn't configured — no
  `ADMIN_PASSWORD_HASH` / `ADMIN_SESSION_SECRET`.
- All conversations & maintenance requests, once AI/forms are used, persist
  **in memory only** (per server process, lost on restart) until Supabase is
  configured.

## XAYVEN AI

`src/lib/ai/` is a small, provider-agnostic layer:

- **`provider.ts`** — talks to any OpenAI-compatible endpoint via plain
  `fetch` (no SDK). Swapping providers = changing `AI_BASE_URL`/`AI_MODEL`.
- **`knowledge.ts`** — builds the system prompt from the site's *own*
  dictionaries and `lib/data/projects.ts` (services, process, portfolio,
  FAQ). The model is instructed to never invent clients, prices, stats or
  capabilities, to say so plainly when it doesn't know something, and to
  treat visitor messages as untrusted input it must never follow as
  instructions (see "Security" below).
- **`conversation.ts`** — parses the model's reply + trailing structured
  JSON block (progressively extracted fields), and computes lead score /
  status **deterministically** — the model can suggest "hot", but only a
  combination of real signals (contact info + budget or urgency) actually
  promotes a lead; asking questions alone never does.
- **`summary.ts`** — a second, narrowly-scoped AI call that writes a short
  internal sales summary once a conversation has enough substance.

The chat widget (`src/components/ai/ChatWidget.tsx`) is a floating bubble
that becomes a full-screen sheet on mobile (respecting safe areas), shows an
availability dot, greets with a fixed message + suggestion chips, and shares
its floating corner with the WhatsApp button (only one shows at a time).

`POST /api/ai/chat` validates input, rate-limits by IP and session, loads/
creates the conversation, calls the provider, extracts fields, scores the
lead, saves, and replies. `GET /api/ai/chat` just reports whether AI is
configured, so the widget can show the right state without spending a turn.

### Diagnosis → chat handoff

`/[locale]/diagnosis` computes a result with plain rule-based logic (see
`src/lib/diagnosis.ts` — no AI call). Clicking "Talk to XAYVEN" stores a short
natural-language summary of the answers in `sessionStorage` and dispatches a
`xayven:open-chat` window event; the chat widget picks it up on open and
sends it as the first message, so the conversation doesn't start from zero.

## Database

Schema: `supabase/migrations/0001_init.sql` — two tables (`conversations`,
`maintenance_requests`), RLS enabled with **zero policies** (only the
service-role key, used exclusively server-side, can read/write; anon/
authenticated get nothing). Apply it via the Supabase SQL editor or
`supabase db push`.

`src/lib/db/` abstracts persistence behind `conversationStore.ts` /
`maintenanceStore.ts`: with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set,
they read/write Postgres; without them, they fall back to an in-memory Map
scoped to the current server process. This is why the whole AI + maintenance
flow works locally with no setup — but it means **data does not survive a
restart and is not shared across instances** until Supabase is configured.
The admin dashboard shows a visible notice when running on the fallback.

Forward-looking note for the future client portal (not built yet): add a
`user_id uuid references auth.users` column to `conversations` and a
per-user RLS policy — see the comment at the bottom of the migration file.

## Admin panel (`/admin`)

- Spanish-only, internal tool, `noindex`, entirely outside the `[locale]`
  tree (`src/proxy.ts` explicitly skips `/admin`).
- Auth: **no hardcoded password.** `ADMIN_PASSWORD_HASH` is a salted scrypt
  hash (generate with `node scripts/hash-password.mjs "password"`); sessions
  are a stateless cookie HMAC-signed with `ADMIN_SESSION_SECRET`, 12h expiry,
  `httpOnly`, `sameSite=lax`, scoped to `/admin`.
- `/admin/login` is its own route, outside the auth-checked
  `(protected)` route group so it isn't caught in a redirect loop.
- Dashboard: totals + hot/interested/exploring counts, recent conversations
  table. Conversation detail: full transcript, AI summary, detected fields,
  "Mark as client" (updates lead status for real), "Convert to project"
  (honest stub — project management is future work), "Contact via WhatsApp"
  (only shown if the visitor volunteered a phone number in chat).

## WhatsApp

`src/components/whatsapp/WhatsAppButton.tsx` renders a `wa.me` link with a
locale-aware prefilled message. It renders **nothing** — not a disabled
button, not a placeholder — until `WHATSAPP_NUMBER` is set, so there's never
a broken link in production. Uses WhatsApp's own green deliberately (a small,
universally recognized affordance), not XAYVEN's violet — it isn't meant to
compete with the brand's primary CTA color.

## Maintenance

`/[locale]/maintenance` — three tiers (Essential / Growth / Care+), no
invented prices (`"Consultar"` / `"Get a quote"` everywhere), each explaining
who it's for and what's included. The request form
(`src/components/maintenance/MaintenanceForm.tsx`) mirrors `ContactForm`'s
pattern and shares its validation conventions via
`maintenanceSchema` in `src/lib/validation.ts`. Submissions go through
`POST /api/maintenance`: validated, persisted (`maintenanceStore.ts`), and
emailed if Resend is configured — same honest "logged, not faked" approach
as the original contact form.

## Payments

Wompi (Sandbox-integrated, Colombia's primary rail), PayPal (Sandbox-
integrated, international), and Wise (manual bank transfer, no real API).
A provider-agnostic `PaymentProvider` interface means the portal, admin UI,
and webhook pattern never talk to a specific gateway directly — see
`src/lib/payments/registry.ts`.

Every payment funnels through one idempotent core
(`applyProviderStatus` in `src/lib/payments/service.ts`), so a webhook
firing twice, a webhook racing the return-page reconciliation, or an admin
double-clicking "confirm" on a Wise transfer all resolve to the same
state instead of double-crediting a project. Amounts are always derived
server-side from the stored `Project` (deposit = 50%, balance = remainder,
full payment = total) — never accepted from the client.

Clients see their project + payment history at `/[locale]/portal/[token]`,
a private capability link an admin copies from a project's detail page in
`/admin/projects` (no separate client login system in this phase).

**Full write-up, exact algorithms, and the Sandbox testing walkthrough:
[docs/payments.md](docs/payments.md).**

## Privacy & security

- `/[locale]/privacy` — plain-language explanation of what's stored (form
  submissions, chat conversations), why, how to request deletion, and an
  explicit note that this is a reasonable implementation, **not** a formal
  legal review.
- Consent: starting a chat with the always-visible notice next to the input
  counts as consent to store that conversation (soft consent, not a
  blocking modal — see the privacy page for the full explanation).
- Rate limiting: in-memory sliding window (`src/lib/rateLimit.ts`) on
  `/api/contact`, `/api/maintenance`, `/api/ai/chat`, and `/api/admin/login`.
  Single-process only today — swap for shared storage (e.g. Upstash Redis)
  if XAYVEN ever runs multiple instances behind a load balancer.
- Prompt injection: the system prompt explicitly tells the model to treat
  visitor messages as untrusted content, never as new instructions, and to
  never reveal the prompt itself. This meaningfully reduces — but, honestly,
  can never fully eliminate — prompt injection risk with today's LLMs.
- All secrets (`AI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `ADMIN_SESSION_SECRET`, `RESEND_API_KEY`) are read server-side only and
  never sent to the client.
- Both contact-style forms keep an honeypot field in addition to Zod
  validation and length limits.

## Internationalization

- Routes are prefixed by locale: `/es/...` and `/en/...`. `/admin` is the one
  intentional exception (see above).
- `src/proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`) redirects
  unprefixed paths to the right locale, based on the `NEXT_LOCALE` cookie
  first, then `Accept-Language`, falling back to Spanish.
- Dictionaries live in `src/lib/i18n/dictionaries/{es,en}.ts` and both
  satisfy the same `Dictionary` type (`src/lib/i18n/dictionary.ts`) — adding
  a key to one without the other is a type error, not a silent gap. This now
  includes `ai`, `whatsapp`, `maintenance`, `diagnosis` and `privacy`.
- Adding a third language: add it to `locales` in `src/lib/i18n/config.ts`,
  add a matching dictionary file, and register it in
  `src/lib/i18n/dictionaries.ts`.

## Content that is real vs. conceptual

Per project scope, **no fake clients, testimonials, stats or results were
invented** anywhere — including in the AI's knowledge base, which is grounded
entirely in the site's real dictionaries and project data. The `/work`
section has:

- **Tartalia Repostería** — a real project (catalog, ordering/reservations,
  legal pages, SEO foundations).
- Two projects explicitly labeled **"Concept project"** — a local shop in
  Jardín, Antioquia, and a boutique real estate agency. Neither is a real
  client.

## Project structure

```
src/
  proxy.ts                    # locale detection + redirect; explicitly skips /admin
  app/
    [locale]/                  # public, bilingual routes — root layout for this tree
      layout.tsx                # renders Header, Footer, ChatWidget
      page.tsx, work/, services/, process/, maintenance/, diagnosis/,
      about/, contact/, privacy/, opengraph-image.tsx, not-found.tsx
    admin/                     # internal tool — own root layout (html/body), Spanish only
      layout.tsx
      login/page.tsx            # outside the auth check on purpose
      (protected)/               # route group: auth-checked, doesn't affect the URL
        layout.tsx                # redirects to /admin/login if session invalid
        page.tsx                  # dashboard (leads)
        conversations/[id]/page.tsx
        projects/, payments/       # payments admin — see docs/payments.md
    portal/[token]/              # client area (public, token-gated) — payments
    api/
      contact/route.ts, maintenance/route.ts
      ai/chat/route.ts           # GET = configured?, POST = one chat turn
      admin/login/route.ts, admin/logout/route.ts
      admin/conversations/[id]/status/route.ts
      admin/projects/route.ts, admin/payments/**    # payments admin actions
      payments/wompi/webhook/route.ts, payments/paypal/webhook|capture/route.ts
    icon.tsx, apple-icon.tsx, manifest.ts, sitemap.ts, robots.ts
    not-found.tsx               # root fallback (outside the locale segment)
  components/
    ui/, layout/, sections/, work/, process/, contact/, motion/   # (V1)
    ai/          # ChatWidget, ChatMessageBubble
    whatsapp/    # WhatsAppButton
    maintenance/ # MaintenancePlanCard, MaintenanceForm
    diagnosis/   # DiagnosisTool
    admin/       # LogoutButton, LeadStatusBadge, ConversationActions, + payments admin
    portal/      # CheckoutPanel (see docs/payments.md)
    payments/    # PaymentStatusBadge (shared portal/admin)
  lib/
    i18n/, seo.ts, constants.ts, validation.ts, utils.ts   # (V1, extended)
    ai/          # provider, knowledge, conversation, summary, clientSession
    db/          # types, supabase client, conversationStore, maintenanceStore,
                 # paymentsStore
    auth/        # admin.ts (scrypt + HMAC sessions)
    payments/    # provider abstraction, service, registry — see docs/payments.md
    diagnosis.ts, rateLimit.ts
supabase/migrations/0001_init.sql, 0002_payments.sql
scripts/hash-password.mjs
```

## Design tokens

All color / radius / shadow / type-scale / motion tokens live in
`src/app/globals.css` under a single Tailwind v4 `@theme` block — there is
no separate `tailwind.config.ts` (Tailwind v4 is CSS-first). The admin panel
reuses the same tokens for visual consistency, with a couple of inline
status colors (lead badges) kept local to `components/admin/` rather than
added to the public brand system.

## Scripts

```bash
npm run dev          # local dev server
npm run build         # production build
npm run start         # run the production build
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm test               # Vitest — payments signature/checksum/idempotency logic
node scripts/hash-password.mjs "your-password"   # generate ADMIN_PASSWORD_HASH
```

## V1.3 / future

- Real client accounts (Supabase Auth) replacing the portal-token model,
  with per-user RLS — schema already leaves room for this (see the comment
  at the bottom of `supabase/migrations/0002_payments.sql`).
- A proper "Convert lead to project" flow linking a conversation directly
  to the project it became, instead of the current manual admin step.
- PayPal Live + Wompi production activation — **only after** the checklist
  in `docs/payments.md` §10 is explicitly signed off.
- Shared (multi-instance) rate limiting and a real counts query instead of
  `listConversations({ limit: 1000 })` for the admin dashboard tiles.
- Real photography for the Tartalia case study; a standalone brand symbol.
- Automated tests (Playwright) for chat, forms, the admin auth flow, and a
  full Sandbox payment E2E run.
