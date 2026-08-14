import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import {
  updateContactRequestStatus,
  ContactRequestNotFoundError,
} from "@/lib/db/contactRequestStore";

export const runtime = "nodejs";

/**
 * Admin-only status change for a contact request — same "one endpoint,
 * enum body, guard server-side" pattern as
 * POST /api/admin/promotions/[id]/status.
 *
 * "converted" is deliberately NOT part of this enum — it's only ever
 * reached through POST .../convert-client, together with a real
 * client_id, never through this manual toggle. This is defense in depth
 * on top of updateContactRequestStatus()'s own parameter type, which
 * already excludes it — see contactRequestStore.ts.
 */
const bodySchema = z.object({
  status: z.enum(["new", "contacted"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`admin-contact-requests:ip:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 });
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
    const updated = await updateContactRequestStatus(id, parsed.data.status);
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (error) {
    if (error instanceof ContactRequestNotFoundError) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    console.error("[admin/contact-requests/status] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "status_change_failed" }, { status: 500 });
  }
}
