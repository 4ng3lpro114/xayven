import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { createService, ServiceSlugConflictError } from "@/lib/db/servicesStore";
import { createServiceSchema } from "@/lib/services/validation";

export const runtime = "nodejs";

/** Admin Phase 5. Creates a service — reuses servicesStore.ts/
 *  services/validation.ts built in Services Phase 1, no new domain
 *  logic here, only the admin-facing write route. */
export async function POST(request: NextRequest) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`admin-services:ip:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = createServiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  try {
    const service = await createService(parsed.data);
    return NextResponse.json({ ok: true, serviceId: service.id });
  } catch (error) {
    if (error instanceof ServiceSlugConflictError) {
      return NextResponse.json({ ok: false, error: "slug_conflict" }, { status: 409 });
    }
    console.error("[admin/services] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "creation_failed" }, { status: 500 });
  }
}
