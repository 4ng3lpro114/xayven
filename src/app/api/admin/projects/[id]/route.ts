import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth/admin";
import {
  getProjectById,
  listPayments,
  deleteProject,
  ProjectDeleteConflictError,
} from "@/lib/db/paymentsStore";
import { getProjectProtectionReason } from "@/lib/projects/protection";

export const runtime = "nodejs";

/**
 * Admin-only. Permanently deletes a project — Fase 8B.
 *
 * Hard rule, enforced HERE (server-side), never trusting the UI: a
 * project with a protection reason (see getProjectProtectionReason) can
 * never be deleted through this endpoint. The reason is recomputed from
 * live data on every request — never accepted as an input, never trusted
 * from a prior page render. This is on top of, not instead of, the
 * `payments.project_id -> projects.id` `ON DELETE RESTRICT` FK already
 * enforced at the database level (Fase 8A audit).
 *
 * Deleting a project NEVER touches `clients` — that FK only runs in the
 * other direction (deleting a CLIENT checks for projects, not the
 * reverse). No other project is ever affected; this only targets the one
 * row matched by `id`.
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

  const project = await getProjectById(id);
  if (!project) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const payments = await listPayments({ projectId: id, limit: 1000 });

  const protectionReason = getProjectProtectionReason({
    status: project.status,
    paidAmount: project.paidAmount,
    payments,
  });

  if (protectionReason !== null) {
    return NextResponse.json({ ok: false, error: protectionReason }, { status: 409 });
  }

  try {
    const result = await deleteProject(id);
    if (!result.deleted) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ProjectDeleteConflictError) {
      // Red de seguridad: la comprobación de arriba dijo que era seguro
      // borrar, pero Postgres rechazó el DELETE real por la FK — p. ej.
      // un pago creado para este proyecto justo entre la comprobación y
      // el DELETE (condición de carrera). No sabemos si ese pago fue
      // aprobado, así que se usa la razón más conservadora
      // (has_payment_attempts: "existe una fila en payments"), nunca se
      // adivina has_payments sin confirmarlo.
      console.error(
        "[admin/projects/delete] Bloqueado por FK real, no detectado por la comprobación previa (¿condición de carrera?):",
        error.message
      );
      return NextResponse.json({ ok: false, error: "has_payment_attempts" }, { status: 409 });
    }
    console.error("[admin/projects/delete] Unexpected error:", error);
    return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
  }
}
