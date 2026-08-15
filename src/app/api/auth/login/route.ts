import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { loginSchema } from "@/lib/auth/schemas";
import { createSupabaseServerClient, isClientAuthConfigured } from "@/lib/auth/supabaseServer";

export const runtime = "nodejs";

/**
 * Client account login (Fase 2). Same shape as /api/admin/login: rate
 * limited (this is a password-guess surface), never reveals whether the
 * email or the password was wrong — only "credenciales incorrectas"
 * either way, matching the admin login's existing discipline.
 */
export async function POST(request: NextRequest) {
  if (!isClientAuthConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`auth-login:ip:${ip}`, { limit: 8, windowMs: 10 * 60 * 1000 });
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

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
