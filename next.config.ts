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
};

export default nextConfig;
