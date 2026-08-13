import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import {
  getPromotionById,
  updatePromotion,
  PromotionNotFoundError,
  PromotionArchivedError,
} from "@/lib/db/promotionStore";
import { updatePromotionSchema, validateFinalPromotionShape } from "@/lib/promotions/validation";

export const runtime = "nodejs";

/**
 * Admin-only. Edits an existing promotion — POST, not PATCH/PUT, matching
 * this codebase's own convention (every mutation so far, including
 * conversation status changes and lead conversion, is POST; no PATCH/PUT
 * handler exists anywhere else in this project to be consistent with).
 *
 * `status` is never accepted here — see UpdatePromotionInput's doc
 * comment; use POST .../status for pause/resume/archive/schedule.
 *
 * Cross-field validation (percentage <= 100, currency required per
 * discount_type, end_at > start_at) runs against the FINAL merged shape
 * (existing row + this patch), not the raw patch alone — a request that
 * only changes `text` must never be rejected by a stale-looking
 * comparison of fields it never touched.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`admin-promotions:ip:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;

  const existing = await getPromotionById(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = updatePromotionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  const finalShape = {
    discountType: parsed.data.discountType ?? existing.discountType,
    discountValue: parsed.data.discountValue ?? existing.discountValue,
    currency: parsed.data.currency !== undefined ? parsed.data.currency : existing.currency,
    startAt: parsed.data.startAt ?? existing.startAt,
    endAt: parsed.data.endAt ?? existing.endAt,
  };
  const shapeErrors = validateFinalPromotionShape(finalShape);
  if (Object.keys(shapeErrors).length > 0) {
    return NextResponse.json({ ok: false, error: "validation_failed", fields: shapeErrors }, { status: 400 });
  }

  try {
    const promotion = await updatePromotion(id, parsed.data);
    return NextResponse.json({ ok: true, promotionId: promotion.id });
  } catch (error) {
    if (error instanceof PromotionNotFoundError) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (error instanceof PromotionArchivedError) {
      return NextResponse.json({ ok: false, error: "archived_read_only" }, { status: 409 });
    }
    console.error("[admin/promotions/edit] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
}
