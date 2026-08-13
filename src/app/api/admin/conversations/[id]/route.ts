import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { getConversationById, deleteConversation } from "@/lib/db/conversationStore";

export const runtime = "nodejs";

/**
 * Admin-only. Permanently deletes a conversation (lead) — Fase 4B.
 *
 * Hard rule, enforced here (server-side), not just in the UI: a
 * conversation already linked to a real client (`clientId` set) can never
 * be deleted — doing so would silently destroy the only record of how
 * that client originated (company, budget, urgency, the full chat
 * history), which is exactly what conversations.client_id + ON DELETE SET
 * NULL was built to prevent losing. See the Fase 4A design discussion.
 *
 * Fase 9C audit: `clientId` alone isn't enough. convertConversationToClient()
 * writes leadStatus="client" (via changeLeadStatus) BEFORE it links
 * clientId in a separate follow-up write (see src/lib/leads/conversion.ts)
 * — a deliberate ordering for self-healing retries. That leaves a real,
 * if narrow, window where leadStatus is already "client" but clientId is
 * still null. Without this second check, a delete landing in exactly that
 * window would destroy the conversation the pending conversion is about
 * to finish linking. Same error code/status as the clientId check — from
 * the caller's point of view it's the same protection, just closing a gap
 * in when it applies.
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

  const conversation = await getConversationById(id);
  if (!conversation) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  if (conversation.clientId || conversation.leadStatus === "client") {
    return NextResponse.json({ ok: false, error: "has_linked_client" }, { status: 409 });
  }

  try {
    const result = await deleteConversation(id);
    if (!result.deleted) {
      // Deleted by someone/something else between the lookup above and
      // this call — report the same 404 a caller would expect either way.
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/conversations/delete] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
  }
}
