import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { setCurrencyConfig } from "@/lib/db/currencyConfigStore";
import { currencyConfigSchema } from "@/lib/pricing/currency/validation";

export const runtime = "nodejs";

/**
 * International Pricing — Phase D Admin. Create-or-replace one currency's
 * rounding rule (currency_config is keyed by `currency` itself — see
 * currencyConfigStore.ts's setCurrencyConfig() doc comment for why a
 * single upsert function is enough here, unlike pricing_catalog/
 * pricing_markets' separate create/update). Only COP/USD are acceptable
 * today (currencyConfigSchema's closed set) — adding a new currency here
 * requires widening that enum first, a deliberate step, never silently
 * accepted.
 */
export async function POST(request: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`admin-currency-config:ip:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = currencyConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    const config = await setCurrencyConfig(parsed.data);
    return NextResponse.json({ ok: true, currency: config.currency });
  } catch (error) {
    console.error("[admin/currency-config] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
}
