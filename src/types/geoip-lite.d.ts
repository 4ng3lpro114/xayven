/**
 * XAYVEN CORE Phase 3.1 — ambient types for `geoip-lite`, which ships no
 * official TypeScript definitions (confirmed: no `.d.ts` in the package,
 * no `@types/geoip-lite` on npm). Only the shape this codebase actually
 * reads (`country`) is declared with confidence; the rest mirrors the
 * package's own documented return fields for completeness, but nothing
 * here depends on them being exactly right beyond `lookup`'s signature.
 */
declare module "geoip-lite" {
  export interface Lookup {
    range: [number, number];
    country: string;
    region: string;
    eu: "0" | "1";
    timezone: string;
    city: string;
    ll: [number, number];
    metro: number;
    area: number;
  }

  export function lookup(ip: string): Lookup | null;

  /**
   * CJS/ESM interop, confirmed by direct testing (see
   * commercialContext.ts's lookupCountryFromIp()): a dynamic `import()`
   * of this CJS module can land its real `module.exports` on `.default`
   * instead of exposing `lookup` as a top-level named export, depending
   * on the runtime. Both shapes are declared here so the defensive
   * `mod.lookup ?? mod.default?.lookup` check type-checks correctly.
   */
  const geoip: { lookup: typeof lookup };
  export default geoip;
}
