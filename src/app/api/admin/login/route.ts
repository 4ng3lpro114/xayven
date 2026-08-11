import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import {
  createSessionToken,
  isAdminConfigured,
  verifyPassword,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/admin";

export const runtime = "nodejs";

const loginSchema = z.object({ password: z.string().min(1).max(200) });

export async function POST(request: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  // Aggressive rate limit — this endpoint is a password guess surface.
  const ip = getClientIp(request);
  const limit = rateLimit(`admin-login:ip:${ip}`, { limit: 8, windowMs: 10 * 60 * 1000 });
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

  const storedHash = process.env.ADMIN_PASSWORD_HASH!;
  const valid = verifyPassword(parsed.data.password, storedHash);
  if (!valid) {
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }

  const token = createSessionToken();
  if (!token) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // "/" (not "/admin") — the admin API lives at /api/admin/*, which a
    // Path=/admin cookie would never be sent to. httpOnly + the signed,
    // expiring token value are the actual security boundary here, not
    // cookie path scoping.
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
