import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { getPricingMarketPriceById, updatePricingMarketPrice, MarketPriceNotFoundError } from "@/lib/db/pricingMarketStore";
import { updatePricingMarketPriceSchema } from "@/lib/pricing/market/validation";

export const runtime = "nodejs";

/**
 * International Pricing — Phase D Admin. Edits a market price — `price`/
 * `priceType`/`isActive` only (see updatePricingMarketPriceSchema's doc
 * comment: `pricingCatalogId`/`marketId`/`currency` are immutable after
 * creation). Folds activate/deactivate into this same edit route
 * (`isActive` is just one more field of the partial patch) rather than a
 * separate `/status` endpoint — pricing_market_prices rows are edited as
 * a whole from one form in Admin, unlike pricing_catalog/pricing_markets,
 * which each have a dedicated one-click list-view toggle.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; priceId: string }> }
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`admin-markets:ip:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const { id, priceId } = await params;

  const existing = await getPricingMarketPriceById(priceId);
  if (!existing || existing.marketId !== id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = updatePricingMarketPriceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    const price = await updatePricingMarketPrice(priceId, parsed.data);
    return NextResponse.json({ ok: true, priceId: price.id });
  } catch (error) {
    if (error instanceof MarketPriceNotFoundError) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    console.error("[admin/markets/prices/edit] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
}
