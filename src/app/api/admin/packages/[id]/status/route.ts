import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { setPricingCatalogItemActive, PricingCatalogItemNotFoundError } from "@/lib/db/pricingCatalogStore";

export const runtime = "nodejs";

/**
 * Admin Phase 5. Activate/deactivate a Pricing Core item — same "one
 * endpoint, enum body" pattern as POST /api/admin/promotions/[id]/status.
 * Never a physical delete (see 0014_pricing_catalog.sql's own comment).
 */
const bodySchema = z.object({
  action: z.enum(["activate", "deactivate"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`admin-packages:ip:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 });
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
    const item = await setPricingCatalogItemActive(id, parsed.data.action === "activate");
    return NextResponse.json({ ok: true, isActive: item.isActive });
  } catch (error) {
    if (error instanceof PricingCatalogItemNotFoundError) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    console.error("[admin/packages/status] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "status_change_failed" }, { status: 500 });
  }
}
