import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { setPricingMarketActive, PricingMarketNotFoundError } from "@/lib/db/pricingMarketStore";

export const runtime = "nodejs";

/**
 * International Pricing — Phase D Admin. Activate/deactivate a market —
 * same "one endpoint, enum body" pattern as
 * /api/admin/packages/[id]/status/route.ts. Never a physical delete
 * (see 0021_pricing_markets.sql's own comment). Deactivating a market
 * that a visitor's `xayven_market` cookie still points at is safe by
 * design — resolveCommercialMarket() only ever trusts an
 * explicit-cookie market when `market.isActive` is true, degrading to
 * the next tier otherwise (see commercialContext.ts).
 */
const bodySchema = z.object({
  action: z.enum(["activate", "deactivate"]),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`admin-markets:ip:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    const market = await setPricingMarketActive(id, parsed.data.action === "activate");
    return NextResponse.json({ ok: true, isActive: market.isActive });
  } catch (error) {
    if (error instanceof PricingMarketNotFoundError) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    console.error("[admin/markets/status] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "status_change_failed" }, { status: 500 });
  }
}
