import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientById, markClientAsCommercial } from "@/lib/db/paymentsStore";

export const runtime = "nodejs";

/**
 * Admin-only. "Agregar cliente" — promotes an account-only client
 * (is_commercial=false, e.g. someone who only registered a XAYVEN account
 * and never went through Lead → Cliente or Solicitud → Cliente) into a
 * real commercial client. This is the manual counterpart to the automatic
 * promotion conversion.ts/contactRequestConversion.ts already perform —
 * same underlying writer (markClientAsCommercial), just triggered
 * directly by the admin instead of by a lead/solicitud conversion event.
 *
 * Idempotent: promoting an already-commercial client is a harmless no-op
 * (same as markClientAsCommercial() itself). Mirrors DELETE
 * /api/admin/clients/[id]/route.ts's structure/error shape exactly (401
 * unauthorized, 404 not_found) — no additional protection check is
 * needed here, unlike DELETE, since promoting is never destructive.
 *
 * Only POST is exported — this project never uses PATCH/PUT anywhere
 * (same convention as the promotions API routes).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const client = await getClientById(id);
  if (!client) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try {
    const updated = await markClientAsCommercial(id);
    return NextResponse.json({ ok: true, client: { id: updated.id, isCommercial: updated.isCommercial } });
  } catch (error) {
    console.error("[admin/clients/promote] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "promote_failed" }, { status: 500 });
  }
}
