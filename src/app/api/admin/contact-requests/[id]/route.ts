import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { getContactRequestById, deleteContactRequest } from "@/lib/db/contactRequestStore";

export const runtime = "nodejs";

/**
 * Admin-only. Permanently deletes a contact request ("Eliminar
 * solicitud"). Same shape as DELETE /api/admin/conversations/[id]: auth
 * check, real lookup (404 if missing), delete, never a false success.
 *
 * Deliberately NO protection check like conversations'/clients' delete
 * routes have — there's nothing to protect against here. A contact
 * request never owns a client, a project, a payment, or a conversation;
 * `client_id` only ever points OUT to `clients` (never the reverse), so
 * deleting this row can never cascade into or otherwise affect any of
 * those. The linked client (if any), its projects/payments/conversations,
 * `client_was_created`, and the request's own status history up to this
 * point are irrelevant to whether this delete is safe — it always is.
 *
 * Only DELETE is exported — Next.js rejects any other method on this path
 * automatically (405), no extra code needed.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const contactRequest = await getContactRequestById(id);
  if (!contactRequest) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try {
    const result = await deleteContactRequest(id);
    if (!result.deleted) {
      // Deleted by someone/something else between the lookup above and
      // this call — report the same 404 a caller would expect either way.
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/contact-requests/delete] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
  }
}
