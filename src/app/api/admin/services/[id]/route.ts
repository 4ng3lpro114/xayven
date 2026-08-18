import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { getServiceById, updateService, ServiceNotFoundError } from "@/lib/db/servicesStore";
import { updateServiceSchema } from "@/lib/services/validation";

export const runtime = "nodejs";

/** Admin Phase 5. Edits an existing service — POST, not PATCH/PUT,
 *  matching this codebase's convention. `slug` is never accepted here —
 *  see UpdateServiceInput's doc comment in services/types.ts. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`admin-services:ip:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;

  const existing = await getServiceById(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = updateServiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    const service = await updateService(id, parsed.data);
    return NextResponse.json({ ok: true, serviceId: service.id });
  } catch (error) {
    if (error instanceof ServiceNotFoundError) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    console.error("[admin/services/edit] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
}
