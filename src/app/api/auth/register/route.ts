import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { registerSchema } from "@/lib/auth/schemas";
import { createSupabaseServerClient, isClientAuthConfigured } from "@/lib/auth/supabaseServer";

export const runtime = "nodejs";

/**
 * Client account registration (Fase 2). Creates the auth.users row via
 * Supabase Auth only — the corresponding public.profiles row (always
 * role='client', client_id=null) is created entirely by the database
 * trigger from 0010_profiles.sql, never by this route. The request body
 * this route accepts has no `role`/`client_id` field at all (see
 * registerSchema) — there is structurally nothing here for a caller to
 * send that could influence either.
 *
 * Two real, honest outcomes after a successful `auth.signUp()`, both
 * handled explicitly rather than assumed:
 *   - Supabase returns a live session immediately (email confirmation
 *     disabled on this project) → the visitor is signed in right away.
 *   - Supabase returns a user but no session (email confirmation
 *     required) → told to check their email. Not "advanced" email
 *     verification — just honestly reporting Supabase's own response
 *     shape instead of assuming one behavior.
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

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
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
