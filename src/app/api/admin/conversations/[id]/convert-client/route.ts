import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { convertConversationToClient, LeadConversionError } from "@/lib/leads/conversion";

export const runtime = "nodejs";

/**
 * Admin-only. Converts a conversation (lead) into a real `clients` row —
 * or, if it was already converted, returns the same link again
 * (idempotent). All the actual logic (find-or-create by normalized email,
 * dedup, idempotency, what to do about a missing name/email) lives in
 * convertConversationToClient() — this route only handles auth, HTTP
 * shape, and mapping its known error codes to HTTP statuses. Never
 * duplicates that logic. See src/lib/leads/conversion.ts.
 *
 * Only POST is exported on purpose — Next.js's router rejects any other
 * method on this path with 405 automatically, with no extra code needed
 * here.
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
    const result = await convertConversationToClient(id);
    // Fase 9C audit: historyRecorded is passed through, not dropped — a
    // `false` here means the conversion itself fully succeeded (client
    // created/linked) but the lead_status_history audit row didn't
    // (already logged server-side). No new alerting is built in this
    // phase; this just stops the caller from being unable to tell.
    return NextResponse.json({
      ok: true,
      client: result.client,
      created: result.clientWasCreated,
      nameDerivedFromCompany: result.nameDerivedFromCompany,
      historyRecorded: result.historyRecorded,
    });
  } catch (error) {
    if (error instanceof LeadConversionError) {
      const status = error.code === "conversation_not_found" ? 404 : 400;
      return NextResponse.json({ ok: false, error: error.code }, { status });
    }

    // A real, unexpected failure (Supabase down, a bug, etc.) — logged
    // server-side for us, never surfaced to the caller. No message, no
    // stack, no internals ever reach the response body.
    console.error("[admin/conversations/convert-client] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "conversion_failed" }, { status: 500 });
  }
}
