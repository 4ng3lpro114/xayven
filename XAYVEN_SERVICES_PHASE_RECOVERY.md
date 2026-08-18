# XAYVEN — Services/Commercial Phase — Recovery Point

**Created:** 2026-08-17, ~12:30 (local session time)
**Purpose:** Full recovery point before starting the Services / Pricing Core / Maintenance / Admin / XAYVEN AI / Analytics / SEO-AEO-GEO / Project Requests / Project Proposals implementation phase. This document is the authoritative "how to undo everything" reference for that phase.

---

## Recovery Point

| Item | Value |
|---|---|
| Branch original | `main` |
| HEAD at snapshot time | `6e37645e3ba29977875772555fecef2cced9b4f1` — "feat: deploy promotions stage A" |
| origin/main at snapshot time | `6e37645e3ba29977875772555fecef2cced9b4f1` (identical — local was fully up to date, nothing unpushed) |
| Git tag created | `xayven-backup-before-services-commercial-phase` (annotated, points at `6e37645`) |
| Working-tree backup | Named stash `xayven-backup-before-services-commercial-phase` (`stash@{0}` at creation time — **verify the index if time has passed, see below**), created with `git stash push -u` (includes untracked files), then restored to the working tree via `git stash apply` (not `pop`) so the stash entry stays intact as a second layer *and* the working tree keeps the real files. |
| External backup | `xayven-backup-before-services-commercial-phase.tar.gz` (~510 KB) in the session scratchpad: `C:\Users\USUARIO\AppData\Local\Temp\claude\C--Users-USUARIO\6899b8bc-30e7-405f-9b0b-10557321b312\scratchpad\`. **This is a temp directory that may be cleaned by the OS/session — treat the git tag + stash as the durable recovery mechanism, this tarball as a convenience extra.** Excludes `node_modules/`, `.next/`, `.git/`, `.env`, `.env.local`, any `*.local` env file. Confirmed to contain only `.env.example` (a committed placeholder template, no real secrets) and confirmed to contain the uncommitted Fase Comercial files (`pricingCatalogStore.ts`, `projectProposalStore.ts`, migration `0014`, etc.). |
| New working branch | `feat/services-commercial-platform`, created from `6e37645` (same commit as `main`/`origin/main`), currently checked out, carrying the same uncommitted/untracked changes forward untouched. |
| origin/main | Untouched — no fetch, push, or force-push performed at any point. |

---

## Estado previo (exact contents protected)

**Modified (uncommitted, tracked):**
- `src/app/[locale]/contact/page.tsx`
- `src/app/admin/(protected)/contact-requests/[id]/page.tsx`
- `src/app/admin/(protected)/contact-requests/page.tsx`
- `src/app/api/contact/route.ts`
- `src/components/contact/ContactForm.tsx`
- `src/lib/clients/__tests__/summary.test.ts`
- `src/lib/db/contactRequestStore.ts`
- `src/lib/db/types.ts`
- `src/lib/i18n/dictionaries/en.ts`
- `src/lib/i18n/dictionaries/es.ts`
- `src/lib/i18n/dictionary.ts`
- `src/lib/validation.ts`

**Untracked (new files, never committed):**
- `XAYVEN_PRICING_AND_PACKAGES.md.txt`
- `src/lib/db/__tests__/pricingCatalogStore.test.ts`
- `src/lib/db/pricingCatalogStore.ts`
- `src/lib/db/projectProposalStore.ts`
- `src/lib/pricing/` (`types.ts`, `validation.ts`, `__tests__/validation.test.ts`)
- `src/lib/proposals/` (`types.ts`, `validation.ts`)
- `src/lib/security/` (`capabilityToken.ts`)
- `supabase/migrations/0014_pricing_catalog.sql`
- `supabase/migrations/0015_contact_requests_pricing_catalog_id.sql`
- `supabase/migrations/0016_project_proposals.sql`

**Migraciones pendientes (código escrito, NO aplicadas a producción, NO ejecutadas por este procedimiento):**
- `0014_pricing_catalog.sql` — Pricing Core (8 items seed: 5 paquetes + Essential/Growth/Care+). Reviewed/approved previously, application interrupted, never run.
- `0015_contact_requests_pricing_catalog_id.sql` — adds `pricing_catalog_id` FK to `contact_requests`. Code-side wiring done, tested; migration itself not applied.
- `0016_project_proposals.sql` — new `project_proposals` table. Written this pass, **not yet typechecked/tested/linted/built**, not applied.

**Cambios comerciales existentes (contexto, not part of this snapshot's job to fix):** this is the in-progress "Fase Comercial — Pricing Core → Project Request → Project Proposals" arc. Fase 2 (Project Request ↔ Pricing Core) is done/tested but uncommitted. Project Proposals Fase A (schema+store) is written but not yet validated. None of this was touched, reverted, or altered by this snapshot procedure — it was only preserved.

---

## Cómo recuperar (recovery instructions)

All commands below are read-only/non-destructive to run for verification; the actual restore commands are marked **[RESTORE]**.

### 1. Recover the exact commit state (`main` as it was)
```bash
git rev-parse xayven-backup-before-services-commercial-phase
# → must print 6e37645e3ba29977875772555fecef2cced9b4f1
```
If `main` (or any branch) ever needs to be forced back to this exact commit:
```bash
# [RESTORE] only if truly needed — this moves a branch pointer, does not touch other branches/tags
git checkout main
git reset --hard xayven-backup-before-services-commercial-phase
```

### 2. Recover the uncommitted working-tree state (Fase Comercial files)
Two independent copies exist:

**A. From the stash (primary mechanism):**
```bash
git stash list
# find the entry labeled "xayven-backup-before-services-commercial-phase"
git stash show -p stash@{N}        # inspect before applying, N = its index
git stash apply stash@{N}          # [RESTORE] re-applies without deleting the stash entry
```

**B. From the external tarball (fallback, if the stash was ever lost or the repo itself is gone):**
```bash
# [RESTORE] extract to a scratch location first, then copy files in manually —
# never extract directly over a live working tree without reviewing diffs first.
tar xzf xayven-backup-before-services-commercial-phase.tar.gz -C /path/to/scratch
```

### 3. Recover `origin/main`
Not needed — `origin/main` was never modified by this procedure (confirmed identical to `main` before and after, no push/force-push executed).

### 4. Abandon the new branch entirely and go back to exactly where `main` was
```bash
# [RESTORE]
git checkout main
git branch -D feat/services-commercial-platform   # only if the branch's work is truly to be discarded
```

### 5. Full verification snapshot (safe to re-run any time)
```bash
git rev-parse xayven-backup-before-services-commercial-phase   # tag → 6e37645...
git rev-parse main                                              # → 6e37645... (should stay unless intentionally advanced)
git rev-parse origin/main                                       # → 6e37645... (should stay unless intentionally pushed)
git stash list                                                  # stash entry should still be present
git branch -vv                                                  # feat/services-commercial-platform should exist
```

---

## Qué NO tocar (protected areas)

Until the implementation master prompt explicitly authorizes touching them:

- `src/app/api/payments/**` — payment system, "no reescritura del sistema de pagos".
- `src/proxy.ts` — locale/admin/auth-callback routing logic.
- Admin authentication (`xayven_admin_session` and everything under `src/app/admin/**`'s auth layer).
- Account/client authentication (Supabase Auth, `src/lib/auth/**`, Fase 12 "Cuentas XAYVEN").
- `contactSchema` and `src/app/api/contact/**` — Project Request intake (extend via the existing `?plan=` mechanism only, never a parallel form/endpoint).
- Existing client/account systems, existing commercial work not explicitly included in the new phase (Promotions core, Payments/Wompi/PayPal/Wise, Analytics V2).

---

## Verification (all confirmed at snapshot time)

1. ✅ Tag `xayven-backup-before-services-commercial-phase` exists (annotated).
2. ✅ Tag points to `6e37645e3ba29977875772555fecef2cced9b4f1`, matching `main`/`origin/main` at creation time.
3. ✅ Working-tree backup exists: named stash `stash@{0}` (created with `-u`, includes untracked files).
4. ✅ Untracked files remain recoverable — verified present in both the working tree (after `stash apply`) and inside the external tarball.
5. ✅ `main` not altered — SHA identical before/after this entire procedure.
6. ✅ No destructive commands run (no `reset --hard`, no `clean -fd`, no `checkout -- .`, no force push).
7. ✅ No migrations executed (`0014`/`0015`/`0016` remain unapplied, exactly as found).
8. ✅ No deploy performed.
9. ✅ No secrets in the external backup — `.env`/`.env.local` explicitly excluded; only the committed `.env.example` placeholder template is present, verified by content (all values blank/placeholder).
10. ✅ New branch `feat/services-commercial-platform` exists, created from the same commit as `main`, currently checked out, carrying the uncommitted Fase Comercial work forward untouched.
11. ✅ This manifest exists at the project root.
12. ✅ Full restore path documented above, independent of this session.
