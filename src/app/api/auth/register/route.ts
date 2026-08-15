import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { registerSchema } from "@/lib/auth/schemas";
import { createSupabaseServerClient, isClientAuthConfigured } from "@/lib/auth/supabaseServer";
import { defaultLocale, hasLocale } from "@/lib/i18n/config";
import { SITE_URL } from "@/lib/constants";

export const runtime = "nodejs";

/**
 * Client account registration (Fase 2, extended with full_name). Creates
 * the auth.users row via Supabase Auth only — the corresponding
 * public.profiles row (always role='client', client_id=null, full_name
 * sourced from auth metadata) is created entirely by the database
 * trigger from 0011_profiles_full_name.sql, never by this route. The
 * request body this route accepts has no `role`/`client_id` field at all
 * (see registerSchema) — there is structurally nothing here for a caller
 * to send that could influence either. `fullName` is passed only as
 * Supabase Auth metadata (`options.data.full_name`), the same mechanism
 * the trigger reads from — never written to profiles directly by this
 * route, and never used as a username/alias (the identifier stays the
 * email).
 *
 * Two real, honest outcomes after a successful `auth.signUp()`, both
 * handled explicitly rather than assumed:
 *   - Supabase returns a live session immediately (email confirmation
 *     disabled on this project) → the visitor is signed in right away.
 *   - Supabase returns a user but no session (email confirmation
 *     required) → told to check their email. Not "advanced" email
 *     verification — just honestly reporting Supabase's own response
 *     shape instead of assuming one behavior.
 *
 * `options.emailRedirectTo` points Supabase's confirmation link at our
 * own /auth/callback (see that route) instead of falling back to
 * Supabase's dashboard-configured Site URL. Built EXCLUSIVELY from the
 * server's own trusted SITE_URL constant — the client never supplies a
 * URL. `locale` is the only thing the request can influence, and it's
 * validated against the closed locale enum (hasLocale()) before being
 * used, defaulting to defaultLocale otherwise — never a free-form value,
 * so there's no way for a caller to redirect the confirmation link
 * anywhere else.
 */
export async function POST(request: NextRequest) {
  if (!isClientAuthConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`auth-register:ip:${ip}`, { limit: 5, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const mismatched = parsed.error.issues.some((issue) => issue.message === "passwords_dont_match");
    return NextResponse.json(
      { ok: false, error: mismatched ? "passwords_dont_match" : "validation_failed" },
      { status: 400 }
    );
  }

  // `locale` is request metadata, not account data — kept out of
  // registerSchema on purpose. Only ever read as a plain string and
  // checked against the closed locale enum; anything else (missing,
  // wrong type, unrecognized value) falls back to defaultLocale.
  const requestedLocale =
    typeof body === "object" && body !== null && "locale" in body
      ? String((body as { locale?: unknown }).locale ?? "")
      : "";
  const locale = hasLocale(requestedLocale) ? requestedLocale : defaultLocale;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
      },
      emailRedirectTo: `${SITE_URL}/auth/callback?locale=${locale}`,
    },
  });

  if (error) {
    // Supabase returns the same generic shape for "already registered" as
    // some other failures depending on project settings — map the ones we
    // can identify confidently, never forward the raw provider message.
    const status = error.status === 429 ? 429 : 400;
    const code = /already registered|already exists/i.test(error.message)
      ? "email_in_use"
      : "register_failed";
    return NextResponse.json({ ok: false, error: code }, { status });
  }

  return NextResponse.json({
    ok: true,
    sessionActive: Boolean(data.session),
    email: data.user?.email ?? parsed.data.email,
  });
}
