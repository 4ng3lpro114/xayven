import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import {
  convertContactRequestToClient,
  ContactRequestConversionError,
} from "@/lib/leads/contactRequestConversion";

export const runtime = "nodejs";

/**
 * Admin-only. "Agregar cliente" on a contact request — same pattern as
 * POST /api/admin/conversations/[id]/convert-client: this route only
 * handles auth, HTTP shape, and mapping known error codes to statuses.
 * All the actual logic (find-or-create by normalized email, dedup,
 * idempotency) lives in convertContactRequestToClient() — see
 * src/lib/leads/contactRequestConversion.ts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const result = await convertContactRequestToClient(id);
    return NextResponse.json({
      ok: true,
      client: result.client,
      created: result.clientWasCreated,
    });
  } catch (error) {
    if (error instanceof ContactRequestConversionError) {
      const status = error.code === "not_found" ? 404 : 409;
      return NextResponse.json({ ok: false, error: error.code }, { status });
    }

    console.error("[admin/contact-requests/convert-client] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "conversion_failed" }, { status: 500 });
  }
}
