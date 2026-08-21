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
        ],
      },
    ];
  },
};

export default nextConfig;
