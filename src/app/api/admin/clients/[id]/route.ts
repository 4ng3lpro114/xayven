import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import {
  getClientById,
  listProjects,
  listPayments,
  deleteClient,
  ClientDeleteConflictError,
} from "@/lib/db/paymentsStore";
import { getClientProtectionReason } from "@/lib/clients/importance";

export const runtime = "nodejs";

/**
 * Admin-only. Permanently deletes a client — Fase 5C, Etapa 10/11.
 *
 * Hard rule, enforced HERE (server-side), never trusting the UI: a client
 * with a protection reason (see getClientProtectionReason) can never be
 * deleted through this endpoint. The reason is recomputed from live data
 * on every request — never accepted as an input, never trusted from a
 * prior page render. This is on top of, not instead of, the
 * `ON DELETE RESTRICT` FKs already enforced at the database level for
 * `projects.client_id`/`payments.client_id`.
 *
 * Fase 5C-fix (auditoría de eliminación de proyectos): "protected" is
 * split into two specific reasons the UI can render distinct copy for —
 * `has_payments` (a project has real money against it — the strongest
 * warning) and `has_related_projects` (a project exists but nothing has
 * been paid yet). Payments win when both are true. The reason is decided
 * by getClientProtectionReason() — the SAME function
 * classifyClientImportance() uses internally — never recomputed here in
 * parallel, so this endpoint can't diverge from it (Fase 5C-fix-2, revisión
 * puntual). A `23503` foreign-key violation surfacing from a real DELETE
 * (e.g. a project created in the tiny race-condition window between the
 * check above and the DELETE below) is also mapped to a controlled 409
 * `has_related_projects`, never a generic 500 — see
 * ClientDeleteConflictError.
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
  // decision itself — getClientProtectionReason only ever depends on
  // payments/projects.
  const protectionReason = getClientProtectionReason({
    leadScore: null,
    leadStatus: null,
    projects,
    hasPayments: payments.length > 0,
  });

  if (protectionReason !== null) {
    return NextResponse.json({ ok: false, error: protectionReason }, { status: 409 });
  }

  try {
    const result = await deleteClient(id);
    if (!result.deleted) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ClientDeleteConflictError) {
      console.error(
        "[admin/clients/delete] Bloqueado por FK real, no detectado por la comprobación previa (¿condición de carrera?):",
        error.message
      );
      return NextResponse.json({ ok: false, error: "has_related_projects" }, { status: 409 });
    }
    console.error("[admin/clients/delete] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
  }
}
