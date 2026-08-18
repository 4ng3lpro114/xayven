import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import {
  getPricingMarketById,
  createPricingMarketPrice,
  MarketPriceConflictError,
  MarketCurrencyMismatchError,
  PricingMarketNotFoundError,
} from "@/lib/db/pricingMarketStore";
import { createPricingMarketPriceSchema } from "@/lib/pricing/market/validation";

export const runtime = "nodejs";

/**
 * International Pricing — Phase D Admin. Creates the official price of
 * one Pricing Core item for THIS market (`id` in the URL — the single
 * source of truth for which market, matching pricing_market_prices'
 * `unique(pricing_catalog_id, market_id)` constraint). `marketId` inside
 * the request body must agree with the URL, or the request is rejected —
 * the URL is authoritative, never silently overridden by the body.
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

  const market = await getPricingMarketById(id);
  if (!market) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = createPricingMarketPriceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }
  if (parsed.data.marketId !== id) {
    return NextResponse.json({ ok: false, error: "market_mismatch" }, { status: 400 });
  }

  try {
    const price = await createPricingMarketPrice(parsed.data);
    return NextResponse.json({ ok: true, priceId: price.id });
  } catch (error) {
    if (error instanceof MarketPriceConflictError) {
      return NextResponse.json({ ok: false, error: "price_conflict" }, { status: 409 });
    }
    if (error instanceof MarketCurrencyMismatchError) {
      return NextResponse.json({ ok: false, error: "currency_mismatch" }, { status: 400 });
    }
    if (error instanceof PricingMarketNotFoundError) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    console.error("[admin/markets/prices] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "creation_failed" }, { status: 500 });
  }
}
