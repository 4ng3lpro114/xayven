import { describe, it, expect } from "vitest";
import sitemap from "../sitemap";
import { locales } from "@/lib/i18n/config";
import { SITE_URL } from "@/lib/constants";

describe("sitemap.ts (SEO/AEO/GEO Phase 8 — /services/[slug] entries)", () => {
  it("incluye /services/[slug] para cada uno de los 5 servicios publicados, en ambos locales", async () => {
    const entries = await sitemap();
    const serviceUrls = entries.map((e) => e.url);

    for (const slug of ["web-development", "ecommerce", "seo", "automation", "custom-solutions"]) {
      for (const locale of locales) {
        expect(serviceUrls).toContain(`${SITE_URL}/${locale}/services/${slug}`);
      }
    }
  });

  it("cada entrada de servicio incluye alternates.languages para ambos locales (hreflang)", async () => {
    const entries = await sitemap();
    const seoEntry = entries.find((e) => e.url === `${SITE_URL}/es/services/seo`);

    expect(seoEntry).toBeDefined();
    expect(seoEntry?.alternates?.languages?.es).toBe(`${SITE_URL}/es/services/seo`);
    expect(seoEntry?.alternates?.languages?.en).toBe(`${SITE_URL}/en/services/seo`);
  });

  it("sigue incluyendo /services (índice), sin duplicarlo", async () => {
    const entries = await sitemap();
    const indexEntries = entries.filter((e) => e.url === `${SITE_URL}/es/services`);
    expect(indexEntries).toHaveLength(1);
  });

  it("nunca incluye rutas privadas (admin/account/login/register/portal)", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    for (const forbidden of ["/admin", "/account", "/login", "/register", "/portal"]) {
      expect(urls.some((u) => u.includes(forbidden))).toBe(false);
    }
  });
});
