"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectImportance, ProjectProtectionReason } from "@/lib/projects/protection";

export type DeleteProjectErrorCode =
  | ProjectProtectionReason
  | "not_found"
  | "unauthorized"
  | "generic";

export type DeleteProjectOutcome =
  | { status: "success" }
  | { status: "error"; code: DeleteProjectErrorCode };

/**
 * Fase 8B — mirrors requestDeleteClient's shape/reasoning exactly (which
 * itself mirrors requestDeleteConversation, Fase 4B): a
 * dependency-injectable, unit-testable function separate from the click
 * handler, never surfacing raw response text to the caller. A 409 always
 * carries one of the three specific reasons from
 * getProjectProtectionReason() so the UI can explain exactly why, never a
 * generic "protected".
 */
export async function requestDeleteProject(
  projectId: string,
  fetchImpl: typeof fetch = fetch
): Promise<DeleteProjectOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/admin/projects/${projectId}`, { method: "DELETE" });
  } catch {
    return { status: "error", code: "generic" };
  }

  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

  if (res.ok && body.ok) {
    return { status: "success" };
  }

  if (res.status === 401) return { status: "error", code: "unauthorized" };
  if (res.status === 404) return { status: "error", code: "not_found" };
  if (res.status === 409) {
    if (body.error === "has_payments") return { status: "error", code: "has_payments" };
    if (body.error === "has_payment_attempts") return { status: "error", code: "has_payment_attempts" };
    if (body.error === "active_work") return { status: "error", code: "active_work" };
    return { status: "error", code: "generic" };
  }

  return { status: "error", code: "generic" };
}

const ERROR_MESSAGES: Record<DeleteProjectErrorCode, string> = {
  has_payments: "Este proyecto no se puede eliminar porque tiene pagos registrados.",
  has_payment_attempts: "Este proyecto no se puede eliminar porque tiene intentos de pago registrados.",
  active_work: "Este proyecto no se puede eliminar porque se encuentra en una etapa de trabajo activa.",
  not_found: "Este proyecto ya no existe.",
  unauthorized: "Tu sesión expiró — recarga la página e inicia sesión de nuevo.",
  generic: "No pudimos eliminar el proyecto. Intenta de nuevo.",
};

/** Same three messages as ERROR_MESSAGES' protected-family entries, keyed
 *  by reason — used for the always-blocked panel below
 *  (importance === "protected"), shown from the first render, before any
 *  DELETE is ever attempted. */
const PROTECTED_REASON_MESSAGES: Record<ProjectProtectionReason, string> = {
  has_payments: ERROR_MESSAGES.has_payments,
  has_payment_attempts: ERROR_MESSAGES.has_payment_attempts,
  active_work: ERROR_MESSAGES.active_work,
};

/** Confirmation copy shown once armed — deliberately different for
 *  "important" (stronger warning) vs "normal". "protected" never reaches
 *  this — it renders the blocked state below instead, before any button
 *  exists to click. */
const CONFIRM_MESSAGES: Record<"normal" | "important", string> = {
  normal: "¿Seguro que quieres eliminar este proyecto?",
  important:
    "Este proyecto está en una etapa avanzada de negociación. Eliminarlo es irreversible. ¿Seguro que quieres continuar?",
};

export function ProjectActions({
  projectId,
  importance,
  protectedReason = null,
}: {
  projectId: string;
  importance: ProjectImportance;
  /** Only meaningful when importance === "protected" — lets the blocked
   *  panel below show the exact reason instead of a generic message.
   *  Optional/nullable so callers that haven't computed it yet still
   *  render something sensible. */
  protectedReason?: ProjectProtectionReason | null;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (importance === "protected") {
    const message = protectedReason
      ? PROTECTED_REASON_MESSAGES[protectedReason]
      : "Este proyecto tiene actividad financiera o de trabajo asociada y no puede eliminarse desde aquí.";
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <div>
          <p className="font-medium text-success">Proyecto protegido</p>
          <p className="mt-1 text-fg-muted">{message}</p>
        </div>
      </div>
    );
  }

  async function handleClick() {
    if (deleting) return;
    if (!armed) {
      // First click only arms the confirmation — nothing is deleted yet.
      setArmed(true);
      setError(null);
      return;
    }

    setDeleting(true);
    setError(null);

    const outcome = await requestDeleteProject(projectId);

    if (outcome.status === "success") {
      router.push("/admin/projects");
      router.refresh();
      return;
    }

    setError(ERROR_MESSAGES[outcome.code]);
    setArmed(false);
    setDeleting(false);
  }

  return (
    <div>
      {armed && !deleting && (
        <p className="mb-2 max-w-md text-xs text-error">
          {CONFIRM_MESSAGES[importance === "important" ? "important" : "normal"]}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleClick}
          disabled={deleting}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors disabled:cursor-default disabled:opacity-50",
            armed
              ? "border-error/40 bg-error/10 text-error hover:bg-error/20"
              : "border-border-strong bg-bg-raised text-fg-muted hover:border-border-accent hover:text-fg"
          )}
        >
          {deleting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="size-4" aria-hidden="true" />
          )}
          {armed ? "Confirmar eliminación" : "Eliminar proyecto"}
        </button>
        {armed && !deleting && (
          <button
            type="button"
            onClick={() => setArmed(false)}
            className="text-xs text-fg-subtle underline transition-colors hover:text-fg-muted"
          >
            Cancelar
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-error">{error}</p>}
    </div>
  );
}
