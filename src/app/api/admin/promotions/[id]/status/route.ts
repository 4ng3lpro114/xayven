import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import {
  schedulePromotion,
  pausePromotion,
  resumePromotion,
  archivePromotion,
  PromotionNotFoundError,
  PromotionTransitionError,
} from "@/lib/db/promotionStore";

export const runtime = "nodejs";

/**
 * Admin-only. The single endpoint for every manual status transition —
 * same "one endpoint, enum body, guard illegal transitions server-side"
 * pattern as POST /api/admin/conversations/[id]/status (Fase 9C).
 *
 * `action` (not a raw `status` value) because "resume" and "schedule"
 * both land on the stored status "scheduled" but from different
 * preconditions (paused→scheduled vs. draft→scheduled) and mean different
 * things — collapsing them into one status value would be ambiguous. See
 * promotionStore.ts for exactly which transitions are legal.
 */
const bodySchema = z.object({
  action: z.enum(["schedule", "pause", "resume", "archive"]),
});

const ACTIONS = {
  schedule: schedulePromotion,
  pause: pausePromotion,
  resume: resumePromotion,
  archive: archivePromotion,
};

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
    const promotion = await ACTIONS[parsed.data.action](id);
    return NextResponse.json({ ok: true, status: promotion.status });
  } catch (error) {
    if (error instanceof PromotionNotFoundError) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (error instanceof PromotionTransitionError) {
      return NextResponse.json({ ok: false, error: "illegal_transition" }, { status: 409 });
    }
    console.error("[admin/promotions/status] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "status_change_failed" }, { status: 500 });
  }
}
