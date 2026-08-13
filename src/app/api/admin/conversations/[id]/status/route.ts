import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/admin";
import { getConversationById } from "@/lib/db/conversationStore";
import { changeLeadStatus, LeadStatusChangeError } from "@/lib/leads/leadStatus";

export const runtime = "nodejs";

/**
 * Admin-only manual status edit — Fase 9C rewrite. Accepts the real
 * LeadStatus enum (nothing invented) but goes exclusively through
 * changeLeadStatus(), the single sanctioned way to change leadStatus
 * anywhere in this codebase. That function refuses `-> "client"` unless
 * the call carries `source: "lead_conversion"` — this route always passes
 * `admin_manual_status_change`, so a direct attempt to set "client" here
 * is rejected with a controlled 409, never silently setting
 * leadStatus="client" with clientId still null (the exact gap the Fase 9C
 * audit found and this rewrite closes). Converting a lead to a client
 * stays exclusively the job of convertConversationToClient() /
 * POST .../convert-client.
 */
const bodySchema = z.object({
  status: z.enum(["exploring", "interested", "hot", "client", "support"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
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

  const conversation = await getConversationById(id);
  if (!conversation) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try {
    const result = await changeLeadStatus({
      conversation,
      newStatus: parsed.data.status,
      changedBy: "admin",
      source: "admin_manual_status_change",
    });

    // Fase 9C audit: historyRecorded is passed through, not dropped — a
    // `false` here means the status change itself landed but the audit
    // row didn't (already logged server-side by changeLeadStatus()). No
    // new alerting is built in this phase; this just stops the caller
    // from being unable to tell the difference.
    return NextResponse.json({
      ok: true,
      leadStatus: result.conversation.leadStatus,
      changed: result.changed,
      historyRecorded: result.historyRecorded,
    });
  } catch (error) {
    if (error instanceof LeadStatusChangeError && error.code === "client_requires_conversion") {
      return NextResponse.json({ ok: false, error: "client_requires_conversion" }, { status: 409 });
    }

    // A real, unexpected failure — logged server-side, never surfaced to
    // the caller (no message, no stack, no internals in the response).
    console.error("[admin/conversations/status] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "status_change_failed" }, { status: 500 });
  }
}
