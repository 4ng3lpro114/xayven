import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { getPricingMarketById, updatePricingMarket, PricingMarketNotFoundError } from "@/lib/db/pricingMarketStore";
import { updatePricingMarketSchema } from "@/lib/pricing/market/validation";

export const runtime = "nodejs";

/**
 * International Pricing — Phase D Admin. Edits an existing market — POST,
 * matching this codebase's convention (see /api/admin/packages/[id]/
 * route.ts). `code` is never accepted here — see
 * updatePricingMarketSchema's doc comment.
 */
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

  const existing = await getPricingMarketById(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = updatePricingMarketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    const market = await updatePricingMarket(id, parsed.data);
    return NextResponse.json({ ok: true, marketId: market.id });
  } catch (error) {
    if (error instanceof PricingMarketNotFoundError) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    console.error("[admin/markets/edit] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
}
