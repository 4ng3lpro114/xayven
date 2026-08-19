import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { deleteClientNote } from "@/lib/db/clientNoteStore";

export const runtime = "nodejs";

/**
 * XAYVEN CORE Phase 3.6 — delete a client note. Only DELETE is exported —
 * Next.js rejects any other method automatically (405), same convention
 * as DELETE /api/admin/clients/[id]/route.ts.
 *
 * `id` (the client) and `noteId` both come from the URL and are passed
 * TOGETHER into deleteClientNote(), which filters by both in the same
 * operation (see clientNoteStore.ts) — this route never trusts `noteId`
 * alone. A note that doesn't exist and a note that belongs to a
 * different client both come back as the same `deleted: false` → 404
 * `not_found`, deliberately indistinguishable (same privacy discipline
 * as the rest of this project — never confirm the existence of data that
 * doesn't belong to the resource in the URL).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`admin-clients-notes:ip:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const { id, noteId } = await params;

  try {
    const result = await deleteClientNote(noteId, id);
    if (!result.deleted) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/clients/notes/delete] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
  }
}
