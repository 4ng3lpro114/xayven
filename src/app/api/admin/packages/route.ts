import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { createPricingCatalogItem, PricingCatalogSlugConflictError } from "@/lib/db/pricingCatalogStore";
import { createPricingCatalogItemSchema } from "@/lib/pricing/validation";

export const runtime = "nodejs";

/**
 * Admin Phase 5. Creates a Pricing Core item (package or maintenance
 * plan) — same POST-only, requireAdminSession()-first, rate-limited
 * shape as every other admin write route in this codebase (see
 * /api/admin/promotions/route.ts).
 */
export async function POST(request: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`admin-packages:ip:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = createPricingCatalogItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    const item = await createPricingCatalogItem(parsed.data);
    return NextResponse.json({ ok: true, itemId: item.id });
  } catch (error) {
    if (error instanceof PricingCatalogSlugConflictError) {
      return NextResponse.json({ ok: false, error: "slug_conflict" }, { status: 409 });
    }
    console.error("[admin/packages] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "creation_failed" }, { status: 500 });
  }
}
