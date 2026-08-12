import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import { getClientById, listProjects, listPayments, deleteClient } from "@/lib/db/paymentsStore";
import { classifyClientImportance } from "@/lib/clients/importance";

export const runtime = "nodejs";

/**
 * Admin-only. Permanently deletes a client — Fase 5C, Etapa 10/11.
 *
 * Hard rule, enforced HERE (server-side), never trusting the UI: a client
 * classified as "protected" (see classifyClientImportance) can never be
 * deleted through this endpoint. The classification is recomputed from
 * live data on every request — never accepted as an input, never trusted
 * from a prior page render. This is on top of, not instead of, the
 * `ON DELETE RESTRICT` FKs already enforced at the database level for
 * `projects.client_id`/`payments.client_id`.
 *
 * Only DELETE is exported — Next.js rejects any other method
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

  const client = await getClientById(id);
  if (!client) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const [projects, payments] = await Promise.all([
    listProjects({ clientId: id }),
    listPayments({ clientId: id, limit: 1000 }),
  ]);

  // Conversation data (lead score/status) isn't needed for the protection
  // decision itself — see classifyClientImportance: the "protected"
  // branch only ever depends on payments/projects, and short-circuits
  // before leadScore/leadStatus are even read.
  const importance = classifyClientImportance({
    leadScore: null,
    leadStatus: null,
    projects,
    hasPayments: payments.length > 0,
  });

  if (importance === "protected") {
    return NextResponse.json({ ok: false, error: "protected" }, { status: 409 });
  }

  try {
    const result = await deleteClient(id);
    if (!result.deleted) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/clients/delete] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
  }
}
