import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n/config";
import { projects } from "@/lib/data/projects";
import { SITE_URL } from "@/lib/constants";

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

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  const allPaths = [
    ...staticPaths,
    ...projects.filter((p) => p.published !== false).map((p) => `/work/${p.slug}`),
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
