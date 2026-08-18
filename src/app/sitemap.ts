import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n/config";
import { projects } from "@/lib/data/projects";
import { SITE_URL } from "@/lib/constants";
import { listServices } from "@/lib/db/servicesStore";

const staticPaths = [
  "/",
  "/work",
  "/services",
  "/process",
  "/maintenance",
  "/diagnosis",
  "/about",
  "/contact",
  "/privacy",
];

const LOW_PRIORITY_PATHS = new Set(["/privacy"]);

/**
 * SEO/AEO/GEO Phase 8 — /services/[slug] entries added here (they never
 * were, since Services Phase 2/3 built the route but this file wasn't
 * touched until now). Same exact pattern already used for /work/[slug]:
 * published-only, one entry per locale, real hreflang alternates. Admin/
 * account/login/register/portal are correctly excluded by omission (an
 * allowlist model, not a disallow list) — same as before this change.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  const services = await listServices({ publishedOnly: true });

  const allPaths = [
    ...staticPaths,
    ...projects.filter((p) => p.published !== false).map((p) => `/work/${p.slug}`),
    ...services.map((s) => `/services/${s.slug}`),
  ];

  for (const path of allPaths) {
    for (const locale of locales) {
      const clean = path === "/" ? "" : path;
      entries.push({
        url: `${SITE_URL}/${locale}${clean}`,
        lastModified: now,
        changeFrequency: path === "/" ? "weekly" : "monthly",
        priority: path === "/" ? 1 : LOW_PRIORITY_PATHS.has(path) ? 0.3 : 0.7,
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [l, `${SITE_URL}/${l}${clean}`])
          ),
        },
      });
    }
  }

  return entries;
}
