import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/supabaseServer";
import { defaultLocale, hasLocale } from "@/lib/i18n/config";
import { SITE_URL } from "@/lib/constants";

export const runtime = "nodejs";

/**
 * Supabase Auth PKCE callback — the single, fixed, non-locale-prefixed
 * URL registered in Supabase's Redirect URLs allow-list
 * (https://xayven.com/auth/callback, plus the localhost variant for dev).
 * Lives outside [locale] for the same reason /admin does (see
 * src/proxy.ts) — Supabase needs one stable URL to redirect to, so the
 * desired locale travels as a validated query param instead of a path
 * segment.
 *
 * @supabase/ssr uses the PKCE flow by default: the confirmation email
 * link doesn't carry the session in a URL fragment (which only
 * client-side JS could read) — it carries a `?code=` in the query
 * string, which only the server can safely exchange for a real session.
 * That's what this route does, via exchangeCodeForSession() on the same
 * SSR client (anon key only) every other auth route already uses —
 * never service_role. A successful exchange makes createSupabaseServerClient()
 * persist the session cookies through its `setAll` (Route Handlers can
 * write cookies, unlike Server Components) — the visitor lands on
 * /{locale}/account already signed in, no second login required.
 *
 * Security: the ONLY thing that can vary in the final redirect target is
 * `locale`, and it's validated against the closed locale enum
 * (hasLocale()) before use — never a free-form URL from the request, so
 * there is no open redirect here. Supabase's own internal error message
 * is never forwarded to the visitor.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const rawLocale = searchParams.get("locale");
  const locale = rawLocale && hasLocale(rawLocale) ? rawLocale : defaultLocale;

  if (!code) {
    return NextResponse.redirect(`${SITE_URL}/${defaultLocale}/login?error=confirmation_failed`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${SITE_URL}/${defaultLocale}/login?error=confirmation_failed`);
  }

  return NextResponse.redirect(`${SITE_URL}/${locale}/account`);
}
