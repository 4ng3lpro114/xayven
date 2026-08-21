import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * XAYVEN CORE Phase 3.1 (International Geolocation fix) — `geoip-lite`
   * locates its own bundled `.dat` files via a `__dirname`-relative path
   * at runtime. Confirmed by direct testing that letting Turbopack bundle
   * it breaks that resolution: the bundled code baked in an absolute path
   * to a build-sandbox root (`C:\ROOT\node_modules\geoip-lite\data\...`)
   * that doesn't exist on the actual running machine, causing every
   * lookup to throw `ENOENT` — silently caught by
   * lookupCountryFromIp()'s own try/catch (by design, so a lookup failure
   * degrades to the fallback market rather than crashing a visitor's
   * request), which is exactly what made this invisible without directly
   * testing a real built-and-started server. `serverExternalPackages`
   * tells Next.js to leave this package as a real `require()` resolved
   * from `node_modules` at runtime instead of bundling it, preserving its
   * own internal path resolution.
   */
  serverExternalPackages: ["geoip-lite"],

  /**
   * XAYVEN CORE Phase 4.3 (Security Headers Hardening) — closes the
   * Strict-Transport-Security / X-Content-Type-Options / X-Frame-Options
   * gaps found by the Production Readiness Audit. Confirmed via a
   * read-only HEAD check against https://xayven.com that HTTP already
   * redirects to HTTPS at the Hostinger CDN edge (no legitimate HTTP
   * flow to preserve), so HSTS is safe to enable. `includeSubDomains` is
   * deliberately omitted: `staging.xayven.com` resolves to a separate,
   * unrelated PHP application outside this repo's control, so subdomain
   * HSTS enforcement can't be verified safe from here. Content-Security-
   * Policy, Permissions-Policy, and Referrer-Policy are intentionally out
   * of scope for this phase (CSP needs its own dedicated audit).
   */
  /**
   * XAYVEN CORE Phase 5 (Production Hardening) — Permissions-Policy,
   * Referrer-Policy, and a Report-Only CSP. Same `headers()` block as
   * Phase 4.3, same source (`/:path*`) — no second block.
   *
   * Permissions-Policy: only restricts browser features confirmed UNUSED
   * anywhere in `src/` (grepped exhaustively — camera/microphone/
   * `navigator.geolocation`/USB/Bluetooth/PaymentRequest all absent).
   * `navigator.clipboard.writeText` IS used (admin "copy link" button) and
   * is deliberately left unrestricted. XAYVEN's own IP-based market
   * detection (`geoip-lite`, server-side) is unrelated to the browser
   * Geolocation API this restricts.
   *
   * Referrer-Policy: `strict-origin-when-cross-origin` — matches the
   * modern browser default already in effect, made explicit rather than
   * relied upon, specifically because `/[locale]/portal/[token]/**`
   * carries a capability token in the path and the same page loads a
   * cross-origin script (`checkout.wompi.co/widget.js`, see below).
   *
   * Content-Security-Policy-Report-Only — deliberately NOT enforcing
   * (`Content-Security-Policy`) yet. Built from an exhaustive read-only
   * inventory of this repo (no dominios inventados):
   *   - script-src: 'self' + https://checkout.wompi.co (the Wompi
   *     WidgetCheckout script, src/components/portal/WompiWidget.tsx) +
   *     'unsafe-inline' — every JSON-LD block in this app
   *     (`<script type="application/ld+json">` in [locale]/layout.tsx,
   *     services/page.tsx, services/[slug]/page.tsx, maintenance/page.tsx)
   *     is inline with per-request dynamic content, so neither a static
   *     hash nor a nonce (which would need touching every one of those
   *     page files — out of this phase's scope) applies; without
   *     'unsafe-inline' every one of those would show up as 100%
   *     already-known noise in the reports. This does NOT reduce what we
   *     learn about Wompi: 'unsafe-inline' only covers inline script
   *     bodies, never a `src`-based load, so Wompi's own script tag is
   *     still governed strictly by the explicit origin allowlist above.
   *   - style-src: 'self' + 'unsafe-inline' — 26 files use React inline
   *     `style={{...}}` (grepped); matches the same "don't touch app code
   *     this phase" constraint as script-src. To be refined later.
   *   - script-src ALSO includes https://cdn.siftscience.com and
   *     https://device.clearsale.com.br — XAYVEN CORE Phase 5 follow-up.
   *     A real portal/capability token was never available to test
   *     WidgetCheckout live, so instead the actual, publicly-served
   *     `checkout.wompi.co/widget.js` was fetched directly (a plain
   *     read-only GET of a public static asset, same as any browser
   *     already does when this widget loads — not a transaction, no
   *     credentials) and its domain literals inspected: it dynamically
   *     injects `<script src="https://cdn.siftscience.com/s.js">` and
   *     `<script src="https://device.clearsale.com.br/p/fp.js">` (Sift/
   *     ClearSale, both well-known fraud-detection SDKs, consistent with
   *     a Colombian payment gateway). Both downstream scripts were
   *     fetched and inspected the same way — neither references any
   *     further domain beyond itself, and neither contains a literal
   *     `fetch()`/`XMLHttpRequest` call to any domain. Two other domain
   *     strings in widget.js (github.com, npms.io) were checked in
   *     context and are bundled open-source license/error-message text
   *     (core-js), never a network target — excluded, not guessed away.
   *   - img-src: 'self' + `data:` + https://device.clearsale.com.br —
   *     widget.js contains one `data:image/svg+xml` background-image
   *     (confirmed by context, an inline SVG icon, not a network
   *     request but still governed by img-src) and ClearSale's fp.js
   *     references `https://device.clearsale.com.br/p/{ci,e,evt}.png`
   *     (classic fingerprint/tracking-pixel pattern) — found via the same
   *     static read, not 100% confirmed as an actively-fired request from
   *     a live capture, but the domain itself is already trusted (same
   *     origin as the confirmed fp.js load), so including it here is
   *     evidence-based, not a guess.
   *   - font-src: 'self' only — zero external font domain found in any of
   *     the 3 fetched scripts (widget.js, Sift's s.js, ClearSale's fp.js).
   *   - frame-src: 'self' + https://checkout.wompi.co — widget.js was
   *     confirmed, by reading its code, to call
   *     `document.createElement("iframe")` and set its `src` via
   *     `"".concat(i, "/p/...")`; `checkout.wompi.co` is the ONLY
   *     wompi.co-related domain string anywhere in the 165KB bundle
   *     (no separate sandbox/production widget host), so `i` is almost
   *     certainly that same origin — not 100% traced to the exact
   *     variable assignment, but no alternative candidate exists in the
   *     file.
   *   - connect-src: 'self' only — STILL a real, undetermined gap, not
   *     resolved by this pass. Static analysis of all 3 scripts found no
   *     literal `fetch()`/`XMLHttpRequest.open()` call to any domain, but
   *     this technique cannot see a URL built from concatenated runtime
   *     variables (e.g. an API base assembled from config at call time)
   *     or a request that only fires inside the iframe's own
   *     `checkout.wompi.co` document (a separate origin/CSP context this
   *     page's policy never governed anyway). A live DevTools Network
   *     capture during an actual sandbox checkout — still blocked, see
   *     below — is the only way to close this with certainty.
   *   - PayPal, Resend, Supabase: confirmed NOT applicable to any browser-
   *     facing directive here — re-verified this pass. PayPal has no
   *     client-side SDK (full-page redirect only, checked
   *     `pay/[type]/page.tsx`); Resend is called exclusively from
   *     `server-only` code (`src/lib/email/send.ts`); Supabase has no
   *     browser client anywhere (`createBrowserClient`/
   *     `NEXT_PUBLIC_SUPABASE_*` both absent) — the browser never talks
   *     to any of the three directly, so CSP (a browser-enforced
   *     mechanism) has nothing to allow for them.
   *   - Cloudinary: confirmed NOT used anywhere in this repo (zero
   *     references in src/, package.json, or this file) — not applicable.
   *   - STILL BLOCKED: no real portal/capability token or admin
   *     credentials were available to reach a live WidgetCheckout.open()
   *     and capture its actual runtime Network/Console activity — same
   *     blocker as the prior pass. The static-analysis evidence above is
   *     substantially stronger than before (real domains from Wompi's own
   *     shipped code, not inference), but does not fully replace a live
   *     capture for connect-src.
   *   - frame-ancestors: 'self' — the CSP-native equivalent of the
   *     X-Frame-Options: SAMEORIGIN already enforced (Phase 4.3); adds
   *     nothing new, carries no unknowns.
   *   - base-uri 'self', object-src 'none': standard hardening,
   *     independent of any resource inventory — confirmed zero
   *     `<object>`/`<embed>` usage.
   *   - form-action 'self': confirmed zero `<form action="...">` pointing
   *     off-origin (every form in this app submits via `fetch()` to a
   *     relative `/api/*` path, not a native form action).
   *   - No `report-uri`/`report-to`: this repo has no CSP report-collector
   *     endpoint. Adding one is a new API route, out of this phase's
   *     approved scope (next.config.ts / package.json only) — so this
   *     Report-Only policy is only inspectable via a real browser's own
   *     DevTools console/Network tab during manual testing, not passively
   *     aggregated from real visitors yet.
   */
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              "script-src 'self' https://checkout.wompi.co https://cdn.siftscience.com https://device.clearsale.com.br 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https://device.clearsale.com.br",
              "font-src 'self'",
              "connect-src 'self'",
              "frame-src 'self' https://checkout.wompi.co",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "object-src 'none'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
