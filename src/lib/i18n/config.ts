export const locales = ["es", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "es";

export const localeNames: Record<Locale, string> = {
  es: "Español",
  en: "English",
};

export const localeLabels: Record<Locale, string> = {
  es: "ES",
  en: "EN",
};

export function hasLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** Path without its leading /{locale} segment, e.g. "/es/work" -> "/work" */
export function stripLocale(pathname: string): string {
  const segments = pathname.split("/");
  if (segments.length > 1 && hasLocale(segments[1])) {
    return "/" + segments.slice(2).join("/");
  }
  return pathname;
}

export function localizePath(pathname: string, locale: Locale): string {
  const stripped = stripLocale(pathname);
  const clean = stripped === "/" ? "" : stripped;
  return `/${locale}${clean}`;
}
