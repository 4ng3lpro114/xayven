import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import {
  getPricingMarketById,
  setMarketCountry,
  removeMarketCountry,
  PricingMarketNotFoundError,
} from "@/lib/db/pricingMarketStore";

export const runtime = "nodejs";

/**
 * International Pricing — Phase D Admin. Adds or removes a country →
 * market route (market_countries). One endpoint, `action` body — same
 * economy as the status routes, since add/remove are the only two
 * operations this sub-resource ever needs (there is no "edit" — a route
 * either exists pointing at one market, or it doesn't; removing it just
 * means the country falls back to 'OTHER' via getMarketForCountry(), see
 * commercialContext.ts). `countryCode` shape is validated here the same
 * way marketCountrySchema already defines it — reused directly, not
 * re-derived.
 */
const bodySchema = z.object({
  action: z.enum(["add", "remove"]),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .length(2, "ISO 3166-1 alpha-2 (2 letras).")
    .regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2, solo letras mayúsculas."),
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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    if (parsed.data.action === "add") {
      await setMarketCountry(parsed.data.countryCode, id);
    } else {
      await removeMarketCountry(parsed.data.countryCode);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PricingMarketNotFoundError) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    console.error("[admin/markets/countries] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
}
