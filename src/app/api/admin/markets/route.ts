import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { createPricingMarket, PricingMarketCodeConflictError } from "@/lib/db/pricingMarketStore";
import { createPricingMarketSchema } from "@/lib/pricing/market/validation";

export const runtime = "nodejs";

/**
 * International Pricing — Phase D Admin. Creates a market — same
 * POST-only, requireAdminSession()-first, rate-limited shape as every
 * other admin write route in this codebase (see
 * /api/admin/packages/route.ts). `conversionAllowed`/`fallbackBehavior`
 * are ordinary fields here (the schema itself requires them explicitly —
 * see pricingMarketSchema — never silently defaulted by this route).
 */
export async function POST(request: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`admin-markets:ip:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = createPricingMarketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    const market = await createPricingMarket(parsed.data);
    return NextResponse.json({ ok: true, marketId: market.id });
  } catch (error) {
    if (error instanceof PricingMarketCodeConflictError) {
      return NextResponse.json({ ok: false, error: "code_conflict" }, { status: 409 });
    }
    console.error("[admin/markets] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "creation_failed" }, { status: 500 });
  }
}
