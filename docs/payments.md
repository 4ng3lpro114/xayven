# XAYVEN Payments

Architecture, setup, and operating notes for the payments system: Wompi
(Colombia, primary), PayPal (international, Sandbox-integrated), and Wise
(manual bank transfer). **Sandbox only in this phase — no Live credentials
are wired up, and nothing here processes real money.**

This document never contains real secrets. Every credential is referenced
by env var name only.

---

## 1. Architecture

```
src/lib/payments/
  types.ts                  Payment / Project / Client domain model, enums
  provider.ts                PaymentProvider interface (createCheckout,
                              fetchTransactionStatus) + CheckoutResult union
  registry.ts                 getProvider(name) — the only way call sites
                               should reach a concrete provider
  reference.ts                 XAYVEN-{projectId}-{unique} generator
  service.ts                    All business rules live here:
                                 - computeAllowedAmount (server-side amount
                                   authorization — see §6)
                                 - applyProviderStatus (the single idempotent
                                   core every provider funnels through)
                                 - initiateProjectPayment /
                                   createMaintenanceCharge /
                                   buildCheckoutForExistingPayment
                                 - reconcileTransaction / confirmManualPayment
  notify.ts                      Payment emails (reuses the Resend pattern
                                  from /api/contact)
  format.ts                      Shared money/status formatting
  providers/
    wompi.ts                      Integrity signature, checkout widget
                                   attributes, GET transaction by id
    wompiWebhook.ts                 Event parsing + checksum verification
                                     (pure functions — see __tests__)
    paypal.ts                        OAuth token, create/capture/get order
    paypalWebhook.ts                   Webhook signature verification
    wise.ts                             MANUAL_BANK_TRANSFER "provider"
  __tests__/                         Vitest unit tests (see §11)

src/lib/db/
  paymentsStore.ts    Supabase-backed persistence with an in-memory
                       fallback (same pattern as the existing
                       conversationStore.ts for the AI assistant)

src/app/
  [locale]/portal/[token]/            Client area (public, token-gated)
    page.tsx                            Project status + payment history
    pay/[type]/page.tsx                   Provider picker → checkout
    pay/maintenance/[paymentId]/page.tsx    Admin-issued maintenance charges
    return/page.tsx                         Post-checkout reconciliation
  admin/(protected)/
    projects/                          Create/list/view projects
    payments/                            All payments, filterable
  api/
    payments/wompi/webhook/route.ts     Wompi transaction.updated events
    payments/paypal/webhook/route.ts      PayPal capture/order events
    payments/paypal/capture/route.ts        Server-side order capture
    admin/projects/route.ts                  Admin: create client+project
    admin/payments/maintenance/route.ts        Admin: create a charge
    admin/payments/[id]/confirm/route.ts         Admin: confirm Wise transfer

supabase/migrations/0002_payments.sql   clients, projects, payments,
                                         payment_webhook_events
```

**Provider abstraction.** Every provider implements the same
`PaymentProvider` interface (`isConfigured`, `createCheckout`,
`fetchTransactionStatus`). Nothing outside `src/lib/payments/registry.ts`
imports a concrete provider class directly, so adding Stripe or another
gateway later means writing one new file and registering it — not touching
the portal pages, the webhook pattern, or the admin UI.

**Single idempotent core.** Every path that can learn a payment's real
status — the Wompi webhook, the PayPal webhook, the PayPal capture route,
the return-page reconciliation, and the admin's manual Wise confirmation —
calls the same `applyProviderStatus()` in `service.ts`. It is guarded twice:
a DB-unique dedup key per `(provider, transactionId, status)` rejects exact
repeat deliveries, and once a payment reaches a terminal status
(`APPROVED`/`DECLINED`/`ERROR`/`VOIDED`/`REFUNDED`) it can never move again.
That's what makes "the same webhook arrives twice" and "the webhook AND the
return page both fire" both safe by construction rather than by convention.

---

## 2. Environment variables

Names only — see `.env.example` for the authoritative list with comments.
**Real values live only in `.env.local` (gitignored) or your hosting
provider's secret manager.**

| Variable | Where it's read | Notes |
| --- | --- | --- |
| `WOMPI_ENV` | server | `sandbox` \| `production` |
| `WOMPI_PUBLIC_KEY` | server → embedded in rendered HTML | Not a secret by Wompi's own design, but still read server-side (no `NEXT_PUBLIC_` prefix) so the server controls exactly what's emitted |
| `WOMPI_PRIVATE_KEY` | server only | Used for `GET /transactions/{id}` |
| `WOMPI_INTEGRITY_SECRET` | server only | Checkout signature generation |
| `WOMPI_EVENTS_SECRET` | server only | Webhook checksum verification |
| `PAYPAL_ENV` | server | `sandbox` \| `production` |
| `PAYPAL_CLIENT_ID` | server only | OAuth2 client-credentials |
| `PAYPAL_CLIENT_SECRET` | server only | **Never** logged, never sent to the client |
| `PAYPAL_WEBHOOK_ID` | server only | From the Sandbox app's webhook config; without it, the PayPal webhook route reports `not_configured` rather than skipping verification |
| `WISE_TRANSFER_INSTRUCTIONS` | server → rendered as plain text | Not a credential — the bank transfer instructions shown to clients |

None of the payment secrets are ever imported into a Client Component —
every file that touches them starts with `import "server-only"`, which
fails the build if that ever changes.

---

## 3. Wompi (Sandbox)

Base API: `https://sandbox.wompi.co/v1` (switches to
`https://production.wompi.co/v1` only when `WOMPI_ENV=production`).

**Checkout.** `WompiProvider.createCheckout` returns a `{ mode: "widget" }`
result: the `data-*` attributes for Wompi's own `widget.js` script
(`data-public-key`, `data-currency`, `data-amount-in-cents`,
`data-reference`, `data-signature:integrity`, `data-redirect-url`),
rendered server-side in `CheckoutPanel.tsx` via JSX spread (so the
colon-containing attribute name is a plain object key, not a JSX parsing
concern).

**Integrity signature** (confirmed against docs.wompi.co, Widget & Checkout
Web, August 2026):

```
SHA256(reference + amountInCents + currency + [expirationTime] + integritySecret)
```

Concatenated as a plain string, no separators, in that exact order,
generated server-side in `generateWompiIntegritySignature`
(`providers/wompi.ts`). `expirationTime` isn't used in this phase (keeps
the signature simpler; add it if a checkout needs to expire).

**Return page ≠ source of truth.** Wompi's own docs are explicit: *"Do not
use the redirection as a validation method of your transactions."* The
return page (`portal/[token]/return`) reads the `id` query param Wompi
appends and calls `GET /transactions/{id}` — but that call's result is fed
through the exact same `applyProviderStatus` the webhook uses, so the
return page never marks a payment approved on its own authority.

**Webhook** (`/api/payments/wompi/webhook`) verifies, in order:
1. Structural shape (Zod schema) — `event`, `data`, `signature.properties`,
   `signature.checksum`, `timestamp`.
2. Checksum — see §5.
3. `environment` (if present in the payload) matches `WOMPI_ENV`.
4. Only reacts to `event: "transaction.updated"`; anything else is
   acknowledged (200) but ignored.
5. Amount + currency cross-check against the Payment we already created for
   that reference — a mismatch is refused (409), never silently applied.

---

## 4. PayPal (Sandbox)

Base API: `https://api-m.sandbox.paypal.com` (→
`https://api-m.paypal.com` only when `PAYPAL_ENV=production`). Plain
`fetch`, no SDK — mirrors `src/lib/ai/provider.ts`'s approach so switching
providers later doesn't mean adopting a new pattern.

**Flow (Orders API v2):**
1. `initiateProjectPayment` → `PayPalProvider.createCheckout` creates an
   Order (`POST /v2/checkout/orders`, `intent: CAPTURE`) and returns its
   `approve` link (`mode: "redirect"`). The order id is persisted onto the
   `Payment` row immediately (`providerTransactionId`), before the buyer
   ever reaches PayPal.
2. The buyer approves on PayPal's site and is redirected back to
   `portal/[token]/return?token=<order_id>&paymentId=<our_id>`.
3. The return page captures the order server-side
   (`POST /v2/checkout/orders/{id}/capture`) and feeds PayPal's own response
   through `applyProviderStatus` — the same authoritative-confirmation
   pattern as Wompi. `/api/payments/paypal/capture` exposes the same
   capture logic as a standalone endpoint for future use (e.g. a JS SDK
   button flow instead of full-page redirect).
4. Capturing an already-captured order returns PayPal's `422`, which is
   treated as "read the current status instead" rather than an error — so
   double-capture (e.g. a retried request) is a safe no-op.

**Webhook** (`/api/payments/paypal/webhook`) verifies signatures via
PayPal's `POST /v1/notifications/verify-webhook-signature` endpoint
(asymmetric, so verification is a server-to-server API call, unlike
Wompi's local HMAC). It's a secondary confirmation path here — the
synchronous capture already gets an authoritative result — kept mainly for
delayed captures, disputes, and the case where the browser never makes it
back to the return page.

> **To verify against a live payload:** PayPal's exact webhook JSON nesting
> (`resource.supplementary_data.related_ids.order_id` for capture events vs.
> `resource.id` for order events) is implemented defensively in
> `extractOrderInfo()` (`src/lib/payments/providers/paypalWebhook.ts` — moved
> out of the route handler so it's directly unit-tested, same split as
> Wompi's `extractWompiTransaction`; see `__tests__/paypalWebhook.test.ts`)
> per the current public docs, but should still be double-checked against a
> real Sandbox delivery the first time a webhook actually fires — see §9.

**Currency — COP does NOT work with PayPal.** This was assumed supported
during planning and then **disproved by an actual Sandbox API call** during
smoke testing (`422 CURRENCY_NOT_SUPPORTED`), confirmed against PayPal's own
[currency codes reference](https://developer.paypal.com/api/rest/reference/currency-codes/):
COP simply isn't in PayPal's supported list (25 currencies — USD, EUR, MXN,
BRL, etc., but not COP). `PAYPAL_SUPPORTED_CURRENCIES` in `providers/paypal.ts`
is that exact list. Practical effect:
- The portal's provider picker **disables the PayPal option** (grayed out,
  not a link) for any project whose `currency` isn't in that list — checked
  server-rendered, not a client-side filter that could be bypassed — and
  shows the client a specific reason (`dict.portal.providerUnavailableCurrency`,
  distinct from `providerUnavailableNotConfigured` for a provider that's
  simply missing env vars) so it never reads as a generic/unexplained error.
- `createCheckout` **also** rejects an unsupported currency directly (defense
  in depth against a stale/direct `?provider=PAYPAL` link), and the admin's
  "create maintenance charge" API does the same check.
- **In practice: create any project that should accept PayPal with
  `currency: "USD"`** (the New Project form already offers COP/USD).
  Wompi and Wise are unaffected and keep working in COP.

---

## 5. Wompi webhook checksum — the algorithm, precisely

This is the part the brief explicitly said not to improvise, so it's
written out in full:

1. Read `signature.properties` **from the event itself** — e.g.
   `["transaction.id", "transaction.status", "transaction.amount_in_cents"]`.
   This array is **not fixed** and must never be hardcoded (Wompi's own
   docs warning) — `computeWompiChecksum` resolves it dynamically every time.
2. Each path is resolved **relative to `data`** (not the event root) — a
   path of `"transaction.id"` means `event.data.transaction.id`. (This one
   detail was caught by a failing unit test during development — see
   `__tests__/wompiWebhook.test.ts`, "matches an independently computed
   SHA256…" — before the fix, every checksum only ever hashed the
   timestamp+secret and silently ignored the actual transaction data.)
3. Concatenate the resolved values, in the order given, with **no
   separators**.
4. Append the event's top-level `timestamp` (as-is).
5. Append `WOMPI_EVENTS_SECRET`.
6. SHA256 the result; compare (case-insensitively) to `signature.checksum`
   (also sent as the `X-Event-Checksum` header, which this implementation
   doesn't need since the checksum is already in the body).

---

## 6. Never trust the client — where amounts actually come from

- **`computeAllowedAmount(project, paymentType)`** (`service.ts`) is the
  only function that decides how much a `DEPOSIT`/`BALANCE`/`FULL_PAYMENT`
  costs. It takes a `Project` (loaded server-side from the DB by portal
  token) and a `paymentType` — there is no third parameter, so there is no
  code path where a request body's `amount` field could reach it. Rules:
  - `DEPOSIT` = 50% of `totalAmount`, only if nothing has been paid yet.
  - `BALANCE` = whatever remains, only once a deposit (or more) exists.
  - `FULL_PAYMENT` = the total, only if nothing has been paid yet.
  - Once `paidAmount >= totalAmount`, every option throws
    `PaymentAuthorizationError("project_fully_paid")`.
- **`MAINTENANCE`** charges skip this function entirely — their amount is
  set by an authenticated admin (`/admin/projects/[id]` → "Cobrar
  mantenimiento" → `POST /api/admin/payments/maintenance`, which requires
  `requireAdminSession()`), never by the client.
- **`clientId`/`projectId`** are never accepted from an unauthenticated
  request body. The client area's only "credential" is the project's
  `portalToken` in the URL path; every portal page loads the project by
  that token server-side and derives everything else from it.
- **PayPal capture** takes only an opaque `orderId`; PayPal's own capture
  API captures whatever amount that order was created with — there is no
  parameter on that endpoint (ours or PayPal's) that could change the
  captured amount.
- **Webhook status** is only ever accepted after checksum/signature
  verification passes — see §3 and §4 — and is cross-checked against the
  Payment's stored amount/currency before being applied.

---

## 7. Payment & project states

```
Payment.status:    PENDING → APPROVED | DECLINED | ERROR | VOIDED | REFUNDED
Payment.paymentType: DEPOSIT | BALANCE | FULL_PAYMENT | MAINTENANCE
Payment.provider:    WOMPI | PAYPAL | WISE

Project.status:    lead → proposal → awaiting_payment → active →
                    in_progress → review → completed | maintenance | cancelled
```

`Project.paidAmount` only changes inside `applyProviderStatus`, only on a
Payment's **first** transition into `APPROVED`, only for non-`MAINTENANCE`
payments, and is capped at `totalAmount` even if (in some edge-case race)
more than one payment would otherwise push it over.

---

## 8. Wise — manual bank transfer, honestly

There is no Wise API integration. `WiseProvider.createCheckout` returns
`{ mode: "manual", instructions }` — the configurable
`WISE_TRANSFER_INSTRUCTIONS` text plus the payment's reference. The client
sees this in their portal; nothing on XAYVEN's side ever claims the
transfer was received automatically. An admin confirms it by hand from
`/admin/payments` or a project's detail page ("Recibido" / "Rechazar"),
which calls `POST /api/admin/payments/{id}/confirm` →
`confirmManualPayment` → the same `applyProviderStatus` core (using the
payment's own id as a stand-in "transaction id", since Wise has none) —
so confirming twice is a safe no-op just like every other provider.

---

## 9. Testing in Sandbox

1. `npm run dev` (or `npm run build && npm run start`).
2. In `/admin` (log in first — see the existing admin README notes),
   go to **Proyectos → Nuevo proyecto**, create a client + a project with a
   `totalAmount` (e.g. `3000000`, `COP`).
3. Copy the client link from the project page
   (`http://localhost:3000/es/portal/<token>`) and open it.
4. Click **Pagar anticipo**, choose **Wompi**, and complete the Sandbox
   checkout using [Wompi's official Sandbox test cards](https://docs.wompi.co/en/docs/colombia/pruebas-vs-produccion/)
   (never real card numbers).
5. You should land on the return page showing "¡Pago recibido!", and the
   project page should show `paidAmount` updated. Check `/admin/payments`
   — the payment should show `APPROVED` with a `providerTransactionId`.
6. **Webhook**: Wompi Sandbox needs a publicly reachable URL to deliver
   webhooks to (`localhost` won't work) — use a tunnel (e.g. `ngrok http
   3000`) and register `https://<tunnel>/api/payments/wompi/webhook` in
   the Sandbox dashboard's Events configuration. Trigger a test event from
   the dashboard, or just complete a real Sandbox checkout — the webhook
   should arrive and the `newTransition` in the response should be `true`
   the first time, `false` (idempotent no-op) if you replay it.
7. **PayPal**: same portal flow, choosing PayPal — you'll need a PayPal
   Sandbox **personal/buyer** test account (create one at
   [developer.paypal.com](https://developer.paypal.com) → Sandbox →
   Accounts) to actually approve the order. For the PayPal webhook, create
   a webhook in the same Sandbox app pointing at
   `https://<tunnel>/api/payments/paypal/webhook`, subscribe to at least
   `PAYMENT.CAPTURE.COMPLETED`, and set `PAYPAL_WEBHOOK_ID` — note PayPal's
   webhook *simulator* sends events that fail real signature verification
   by design, so use an actual Sandbox checkout to test end-to-end.
8. **Wise**: choose "Transferencia bancaria" in the portal, confirm the
   instructions render, then go confirm it manually from `/admin`.
9. **Declined test**: Wompi Sandbox has specific card numbers that always
   decline — use one to confirm the `returnHeadingDeclined` state and that
   `paidAmount` is untouched.

Automated unit tests: `npm test` (see §11) — these don't need Sandbox
network access at all; they cover the signature/checksum math and the
idempotent status-transition logic directly.

---

## 10. Production checklist — DO NOT check these off without explicit approval

- [ ] Wompi **production** keys (`WOMPI_ENV=production` +
      production `WOMPI_PUBLIC_KEY`/`WOMPI_PRIVATE_KEY`/
      `WOMPI_INTEGRITY_SECRET`/`WOMPI_EVENTS_SECRET`)
- [ ] PayPal **Live** app credentials (`PAYPAL_ENV=production` +
      live `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`/`PAYPAL_WEBHOOK_ID`) —
      **never** the account owner's personal/legacy PayPal account
- [ ] Wompi webhook URL registered in the **production** merchant dashboard,
      HTTPS, pointing at the real domain
- [ ] PayPal webhook registered on the **Live** app, HTTPS
- [ ] `NEXT_PUBLIC_SITE_URL` set to the real production domain (checkout
      return URLs are built from this)
- [ ] `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` pointing at a real,
      backed-up production database — **not** the in-memory fallback
- [ ] `RESEND_API_KEY` + verified sending domain, so payment emails
      actually deliver
- [ ] `ADMIN_PASSWORD_HASH` / `ADMIN_SESSION_SECRET` rotated for production
      (don't reuse Sandbox-era values)
- [ ] `npm run lint && npm run typecheck && npm run build && npm test`
      all clean
- [ ] `.env.local` confirmed untracked (`.gitignore` already covers
      `.env*`) and no secret ever appears in git history
- [ ] A real transaction end-to-end tested against production keys for a
      **small real amount**, by a human, before announcing payments are live

**This project intentionally stops here.** Flipping `WOMPI_ENV` /
`PAYPAL_ENV` to `production` and deploying real keys is a business decision
with real money attached — it should happen only with explicit sign-off,
not as a side effect of shipping code.

---

## 11. Automated tests

```bash
npm test
```

Covers (see `src/lib/payments/__tests__/`):

- **Wompi integrity signature** — matches an independently-computed
  SHA256, respects field order, changes with the amount, includes
  `expirationTime` correctly when provided.
- **Wompi webhook checksum** — accepts a valid checksum, rejects a wrong
  secret, rejects tampered transaction data, rejects a tampered checksum
  itself, resolves `signature.properties` dynamically (doesn't hardcode a
  field list), matches an independently computed hash.
- **Environment check** — sandbox vs. production event rejection.
- **Reference generation** — format, and uniqueness across 500 calls for
  the same project.
- **`computeAllowedAmount`** — deposit/balance/full-payment rules, and that
  every path is blocked once a project is fully paid (no accidental
  overpay).
- **`applyProviderStatus` idempotency** — APPROVED applied exactly once
  even when the "webhook" fires twice; DECLINED/ERROR/VOIDED never touch
  `paidAmount`; a payment can never leave a terminal status once reached;
  an unknown transaction/reference resolves to `null` rather than
  fabricating a payment; `paidAmount` is capped at `totalAmount` even under
  a contrived double-approval scenario.
- **PayPal webhook** (`paypalWebhook.test.ts`) — header presence/absence
  (`readPayPalWebhookHeaders`), payload-shape extraction for both capture
  and order events including the custom_id/reference_id fallback chain
  (`extractOrderInfo`), the event→status map (including that
  `CHECKOUT.ORDER.APPROVED` and unrecognized event types map to nothing, so
  the route acknowledges-and-ignores them rather than guessing), signature
  verification against a mocked PayPal API (fails closed with no network
  call when `PAYPAL_WEBHOOK_ID` is unset, `SUCCESS`/`FAILURE`/non-2xx all
  handled), and an end-to-end idempotency run of a realistic
  `PAYMENT.CAPTURE.COMPLETED` body through `extractOrderInfo` +
  `applyProviderStatus` twice — first call approves and credits the
  project, the replay is a no-op.

**Not covered by automated tests** (exercised manually per §9 instead,
since they need a running server / real Sandbox network calls): full HTTP
request/response cycles through the Next.js route handlers (request
parsing, rate limiting, status codes as seen by an actual caller), live
PayPal OAuth + Orders API calls, and an actual unauthenticated-portal-token
404.

---

## 12. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Chat widget / payments feel "not configured" | Expected without env vars — see §2. Check `GET /api/ai/chat` isn't confused with payments; payments have no equivalent status endpoint yet, check server logs for `not_configured` instead. |
| Wompi webhook returns 401 | Checksum mismatch — almost always `WOMPI_EVENTS_SECRET` wrong/missing, or the request isn't actually from Wompi. Check the server log line `[wompi-webhook] Rejected: checksum verification failed`. |
| Wompi webhook returns 503 | `WOMPI_EVENTS_SECRET` not set at all. |
| Wompi webhook returns 409 | Amount/currency in the event doesn't match the stored Payment — investigate before assuming it's safe to ignore; could indicate a reference collision or a real integration bug. |
| PayPal webhook returns 503 | `PAYPAL_WEBHOOK_ID` not set. |
| PayPal capture 502s | Check `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` and that the order hasn't expired (PayPal orders have a validity window) — this is why `buildCheckoutForExistingPayment` generates checkout fresh on every visit rather than pre-generating and storing it. |
| PayPal pay page shows a generic error / order create fails with `CURRENCY_NOT_SUPPORTED` | The project's `currency` isn't one PayPal supports (COP is the common case — see §4). Create the project with `currency: "USD"` instead if it needs to accept PayPal. |
| Project shows `paidAmount` unchanged after a Sandbox payment | Check the payment's status in `/admin/payments` first — if still `PENDING`, the webhook likely hasn't been delivered (needs a public URL, see §9) and the return page didn't reconcile either (check for a `paymentId` query param on the return URL). |
| Data disappears after a restart | No Supabase configured — the in-memory fallback is exactly that, in-memory. Expected in local dev; must not happen in production (see §10). |

---

## 13. Known limitations (V1 of payments)

- **Client-area auth is a capability URL (`portalToken`)**, not a real
  account system — matches the same pattern already used for the AI
  assistant's admin-shared links. Anyone with the link can view that one
  project. Good enough for a small number of active clients; a real
  authenticated multi-project portal (Supabase Auth,
  `projects.owner_user_id`, RLS policies) is the natural next step and the
  schema leaves room for it (see the comment at the bottom of
  `0002_payments.sql`).
- **PayPal webhook field extraction** (`extractOrderInfo`) is implemented
  defensively against documented shapes but not yet confirmed against a
  live Sandbox delivery — see the note in §4.
- **Rate limiting is in-memory, single-process** (same as the rest of the
  app's rate limiter) — fine for one server instance, not for a
  multi-instance deployment without a shared store.
- **Admin dashboard payment counts** re-scan up to 1000 rows rather than
  using a real aggregate query — matches the existing lead-conversation
  dashboard's approach; fine at current scale.
- A rare double-approval race (two already-created PENDING payments both
  getting approved before either completes) is capped at the project's
  `totalAmount` rather than fully reconciled/refunded automatically — see
  §6 and the `applyProviderStatus` test for the exact capping behavior.
