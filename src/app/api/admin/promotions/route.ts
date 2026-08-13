import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { createPromotion } from "@/lib/db/promotionStore";
import { createPromotionSchema, validateFinalPromotionShape } from "@/lib/promotions/validation";

export const runtime = "nodejs";

/**
 * Admin-only. Creates a promotion — always starts as `status: "draft"`
 * regardless of what the request implies about dates (see
 * createPromotion() in promotionStore.ts: a fresh promotion is never
 * accidentally live). Use POST .../[id]/status with {"action":"schedule"}
 * to actually put it on the clock.
 */
export async function POST(request: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`admin-promotions:ip:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = createPromotionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  const shapeErrors = validateFinalPromotionShape(parsed.data);
  if (Object.keys(shapeErrors).length > 0) {
    return NextResponse.json({ ok: false, error: "validation_failed", fields: shapeErrors }, { status: 400 });
  }

  try {
    const promotion = await createPromotion(parsed.data);
    return NextResponse.json({ ok: true, promotionId: promotion.id });
  } catch (error) {
    console.error("[admin/promotions] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "creation_failed" }, { status: 500 });
  }
}
