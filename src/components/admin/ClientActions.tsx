"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientImportance } from "@/lib/clients/importance";

export type DeleteClientErrorCode =
  | "has_related_projects"
  | "has_payments"
  | "protected"
  | "not_found"
  | "unauthorized"
  | "generic";

export type DeleteClientOutcome = { status: "success" } | { status: "error"; code: DeleteClientErrorCode };

/**
 * Mirrors requestDeleteConversation's shape/reasoning exactly (Fase 4B) —
 * a dependency-injectable, unit-testable function separate from the click
 * handler, never surfacing raw response text to the caller.
 *
 * Fase 5C-fix (auditoría de eliminación de proyectos): a 409 now carries a
 * specific `error` code from the backend (`has_related_projects` /
 * `has_payments`) so the UI can show the exact reason instead of one
 * generic "protected" message. `protected` is kept only as a defensive
 * fallback for any 409 reason this client doesn't recognize yet — still
 * mapped to a "can't delete" message, never to the misleading "try again"
 * generic one.
 */
export async function requestDeleteClient(
  clientId: string,
  fetchImpl: typeof fetch = fetch
): Promise<DeleteClientOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/admin/clients/${clientId}`, { method: "DELETE" });
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
    if (body.error === "has_related_projects") return { status: "error", code: "has_related_projects" };
    return { status: "error", code: "protected" };
  }

  return { status: "error", code: "generic" };
}

/**
 * "Agregar cliente" — promotes an account-only client (is_commercial =
 * false) into a real commercial client. Mirrors requestDeleteClient's
 * shape/reasoning exactly, just against the new promote endpoint (see
 * POST /api/admin/clients/[id]/promote).
 */
export type PromoteClientErrorCode = "not_found" | "unauthorized" | "generic";

export type PromoteClientOutcome =
  | { status: "success" }
  | { status: "error"; code: PromoteClientErrorCode };

export async function requestPromoteClient(
  clientId: string,
  fetchImpl: typeof fetch = fetch
): Promise<PromoteClientOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/admin/clients/${clientId}/promote`, { method: "POST" });
  } catch {
    return { status: "error", code: "generic" };
  }

  const body = (await res.json().catch(() => ({}))) as { ok?: boolean };

  if (res.ok && body.ok) {
    return { status: "success" };
  }

  if (res.status === 401) return { status: "error", code: "unauthorized" };
  if (res.status === 404) return { status: "error", code: "not_found" };

  return { status: "error", code: "generic" };
}

const PROMOTE_ERROR_MESSAGES: Record<PromoteClientErrorCode, string> = {
  not_found: "Este cliente ya no existe.",
  unauthorized: "Tu sesión expiró — recarga la página e inicia sesión de nuevo.",
  generic: "No pudimos agregar el cliente. Intenta de nuevo.",
};

const ERROR_MESSAGES: Record<DeleteClientErrorCode, string> = {
  has_related_projects: "Este cliente no se puede eliminar porque tiene proyectos asociados.",
  has_payments: "Este cliente está protegido porque tiene proyectos con pagos registrados.",
  protected: "Este cliente tiene actividad comercial asociada y no puede eliminarse desde aquí.",
  not_found: "Este cliente ya no existe.",
  unauthorized: "Tu sesión expiró — recarga la página e inicia sesión de nuevo.",
  generic: "No pudimos eliminar el cliente. Intenta de nuevo.",
};

/** Same three messages as ERROR_MESSAGES' protected-family entries, keyed
 *  by reason instead of by response code — used for the always-blocked
 *  panel below (importance === "protected"), which is shown from the
 *  first render, before any DELETE is ever attempted. */
const PROTECTED_REASON_MESSAGES: Record<"has_payments" | "has_related_projects", string> = {
  has_payments: ERROR_MESSAGES.has_payments,
  has_related_projects: ERROR_MESSAGES.has_related_projects,
};

/** Confirmation copy shown once armed — deliberately different for
 *  "important" (stronger warning) vs "normal", per Fase 5C Etapa 10.
 *  "protected" never reaches this — it renders the blocked state below
 *  instead, before any button exists to click. */
const CONFIRM_MESSAGES: Record<"normal" | "important", string> = {
  normal: "¿Seguro que quieres eliminar este cliente?",
  important:
    "Este cliente tiene un nivel de interés alto y representa una oportunidad comercial. ¿Seguro que quieres eliminarlo?",
};

export function ClientActions({
  clientId,
  importance,
  protectedReason = null,
  isCommercial,
}: {
  clientId: string;
  importance: ClientImportance;
  /** Only meaningful when importance === "protected" — lets the blocked
   *  panel below show the exact reason (proyectos vs. pagos) instead of a
   *  generic message. Optional/nullable so existing callers that haven't
   *  been updated yet keep working with the original generic copy. */
  protectedReason?: "has_payments" | "has_related_projects" | null;
  /** `clients.is_commercial` (0012_clients_is_commercial.sql). `false`
   *  means this row only has a XAYVEN account linked, never went through
   *  any commercial flow — "Eliminar cliente" makes no conceptual sense
   *  for it (there's no commercial relationship to delete), so this
   *  branch takes priority over everything below and offers "Agregar
   *  cliente" instead. A non-commercial client can never be "protected"
   *  either — protection only comes from real projects/payments, and
   *  creating a project for an account-only client promotes it to
   *  commercial first (see POST /api/admin/projects) — but this check is
   *  still ordered first, defensively, rather than assumed unreachable. */
  isCommercial: boolean;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  if (!isCommercial) {
    async function handlePromote() {
      if (promoting) return;
      setPromoting(true);
      setPromoteError(null);

      const outcome = await requestPromoteClient(clientId);

      if (outcome.status === "success") {
        router.refresh();
        setPromoting(false);
        return;
      }

      setPromoteError(PROMOTE_ERROR_MESSAGES[outcome.code]);
      setPromoting(false);
    }

    return (
      <div>
        <button
          type="button"
          onClick={handlePromote}
          disabled={promoting}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-bg-raised px-3 py-2 text-sm text-fg-muted transition-colors hover:border-border-accent hover:text-fg disabled:cursor-default disabled:opacity-50"
        >
          {promoting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="size-4" aria-hidden="true" />
          )}
          Agregar cliente
        </button>
        {promoteError && <p className="mt-2 text-xs text-error">{promoteError}</p>}
      </div>
    );
  }

  if (importance === "protected") {
    const message = protectedReason
      ? PROTECTED_REASON_MESSAGES[protectedReason]
      : ERROR_MESSAGES.protected;
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <div>
          <p className="font-medium text-success">Cliente protegido</p>
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

    const outcome = await requestDeleteClient(clientId);

    if (outcome.status === "success") {
      router.push("/admin/clients");
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
          {armed ? "Confirmar eliminación" : "Eliminar cliente"}
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
