import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { defaultLocale, hasLocale, locales } from "@/lib/i18n/config";

const LOCALE_COOKIE = "NEXT_LOCALE";

function detectLocale(request: NextRequest): string {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieLocale && hasLocale(cookieLocale)) return cookieLocale;

  const acceptLanguage = request.headers.get("accept-language") ?? "";
  const preferred = acceptLanguage.split(",")[0]?.split("-")[0]?.trim();
  if (preferred && hasLocale(preferred)) return preferred;

  return defaultLocale;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The admin panel is an internal, non-localized tool — never redirect it
  // into /es/admin or /en/admin.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return NextResponse.next();
  }

  // Same exception, same reason: Supabase Auth's email confirmation link
  // must redirect to one single, fixed, non-locale-prefixed URL — the
  // exact one registered in Supabase's Redirect URLs allow-list
  // (https://xayven.com/auth/callback). If this got rewritten to
  // /es/auth/callback here, it would 404 (the route only exists at
  // /auth/callback) — the desired locale travels as a validated
  // ?locale= query param instead of a path segment. See
  // src/app/auth/callback/route.ts.
  if (pathname === "/auth/callback") {
    return NextResponse.next();
  }

  const pathnameHasLocale = locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)
  );
  if (pathnameHasLocale) return NextResponse.next();

  const locale = detectLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;

  const response = NextResponse.redirect(url);
  response.cookies.set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, path: "/" });
  return response;
}

export const config = {
  matcher: [
    // Skip API routes, Next internals, generated icon/manifest routes
    // (favicon.ico, icon, apple-icon, manifest.webmanifest, robots.txt,
    // sitemap.xml — none of these are locale-specific), and any request
    // for a file with an extension (static assets).
    "/((?!api|admin|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|robots.txt|sitemap.xml|.*\\..*).*)",
  ],
};
