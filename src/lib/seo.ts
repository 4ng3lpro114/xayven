import type { Metadata } from "next";
import { locales, type Locale } from "@/lib/i18n/config";
import { SITE_NAME, SITE_URL } from "@/lib/constants";

interface BuildMetadataOptions {
  locale: Locale;
  path: string; // path without locale prefix, e.g. "/work" or "/"
  title: string;
  description: string;
  /** Set false for pages that shouldn't be indexed (kept for future use). */
  index?: boolean;
}

function absoluteUrl(locale: Locale, path: string): string {
  const clean = path === "/" ? "" : path;
  return `${SITE_URL}/${locale}${clean}`;
}

/**
 * Builds a full Metadata object with canonical + hreflang alternates for a
 * given localized path. NEXT_PUBLIC_SITE_URL is the single source of truth
 * for absolute URLs across the site.
 */
export function buildMetadata({
  locale,
  path,
  title,
  description,
  index = true,
}: BuildMetadataOptions): Metadata {
  const languages: Record<string, string> = {};
  for (const l of locales) {
    languages[l] = absoluteUrl(l, path);
  }
  languages["x-default"] = absoluteUrl("es", path);

  const url = absoluteUrl(locale, path);

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages,
    },
    robots: index
      ? { index: true, follow: true }
      : { index: false, follow: false },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: locale === "es" ? "es_ES" : "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
