"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContactRequest } from "@/lib/db/types";

export type ContactRequestActionOutcome =
  | { status: "success" }
  | { status: "error"; code: "unauthorized" | "not_found" | "generic" };

/**
 * Dependency-injectable request function — same shape as
 * requestConvertToClient()/requestPromotionStatusChange() elsewhere in
 * this admin, testable without mocking global fetch or rendering
 * anything (this project has no component-rendering test infrastructure
 * installed).
 */
export async function requestContactRequestStatusChange(
  contactRequestId: string,
  status: Exclude<ContactRequest["status"], "converted">,
  fetchImpl: typeof fetch = fetch
): Promise<ContactRequestActionOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/admin/contact-requests/${contactRequestId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  } catch {
    return { status: "error", code: "generic" };
  }

  const body = (await res.json().catch(() => ({}))) as { ok?: boolean };

  if (res.ok && body.ok) return { status: "success" };
  if (res.status === 401) return { status: "error", code: "unauthorized" };
  if (res.status === 404) return { status: "error", code: "not_found" };
  return { status: "error", code: "generic" };
}

const ERROR_MESSAGES: Record<Exclude<ContactRequestActionOutcome, { status: "success" }>["code"], string> = {
  unauthorized: "Tu sesión expiró — recarga la página e inicia sesión de nuevo.",
  not_found: "Esta solicitud ya no existe.",
  generic: "No pudimos completar la acción. Intenta de nuevo.",
};

const STATUS_LABELS: Record<Exclude<ContactRequest["status"], "converted">, string> = {
  new: "Marcar como nueva",
  contacted: "Marcar como contactada",
};

/**
 * Manual status toggle — deliberately only ever offers "new"/"contacted"
 * as click targets. "converted" is never one of them: it's only ever
 * reached through ContactRequestConvertClientButton below, together with
 * a real client_id (see contactRequestStore.ts's
 * linkContactRequestToClient). Rendered by the parent page only when the
 * request has no clientId yet — once converted, this component isn't
 * shown at all (replaced by the "Cliente asociado" block).
 */
export function ContactRequestStatusActions({ request }: { request: ContactRequest }) {
  const router = useRouter();
  const [loading, setLoading] = useState<ContactRequest["status"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const otherStatuses = (["new", "contacted"] as const).filter((s) => s !== request.status);

  async function handleClick(status: Exclude<ContactRequest["status"], "converted">) {
    setLoading(status);
    setError(null);
    const outcome = await requestContactRequestStatusChange(request.id, status);
    setLoading(null);

    if (outcome.status === "success") {
      router.refresh();
      return;
    }
    setError(ERROR_MESSAGES[outcome.code]);
  }

  return (
    <>
      {otherStatuses.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => handleClick(s)}
          disabled={loading !== null}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-bg-raised px-3 py-2 text-sm text-fg-muted transition-colors hover:border-border-accent hover:text-fg disabled:cursor-default disabled:opacity-50"
          )}
        >
          {loading === s && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {STATUS_LABELS[s]}
        </button>
      ))}
      {error && <p className="w-full text-xs text-error">{error}</p>}
    </>
  );
}

export type ConvertContactRequestOutcome =
  | { status: "success"; clientId: string; created: boolean }
  | { status: "error"; code: "unauthorized" | "not_found" | "client_not_found" | "generic" };

/**
 * "Agregar cliente" — same request/response-interpretation shape as
 * requestConvertToClient() in ConversationActions.tsx. Reuses the exact
 * same conversion philosophy (see contactRequestConversion.ts) without
 * duplicating any of its logic here — this function only talks to the
 * route and interprets its response.
 */
export async function requestConvertContactRequestToClient(
  contactRequestId: string,
  fetchImpl: typeof fetch = fetch
): Promise<ConvertContactRequestOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/admin/contact-requests/${contactRequestId}/convert-client`, {
      method: "POST",
    });
  } catch {
    return { status: "error", code: "generic" };
  }

  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    client?: { id?: string };
    created?: boolean;
    error?: string;
  };

  if (res.ok && body.ok && body.client?.id) {
    return { status: "success", clientId: body.client.id, created: Boolean(body.created) };
  }

  if (res.status === 401) return { status: "error", code: "unauthorized" };
  if (res.status === 404) return { status: "error", code: "not_found" };
  if (body.error === "client_not_found") return { status: "error", code: "client_not_found" };

  return { status: "error", code: "generic" };
}

const CONVERT_ERROR_MESSAGES: Record<
  Exclude<ConvertContactRequestOutcome, { status: "success" }>["code"],
  string
> = {
  unauthorized: "Tu sesión expiró — recarga la página e inicia sesión de nuevo.",
  not_found: "Esta solicitud ya no existe.",
  client_not_found:
    "El cliente vinculado ya no existe — contacta a soporte antes de reintentar.",
  generic: "No pudimos completar la conversión. Intenta de nuevo.",
};

/**
 * Rendered by the parent page in two cases, both driven by `request.status`
 * (never by `clientId` alone — see [id]/page.tsx's doc comment): before any
 * conversion has happened at all, and again for the recovery case where
 * `status === "converted"` but the linked client can no longer be found
 * (deleted after conversion — `client_id` is nulled by
 * `ON DELETE SET NULL`, kept intact on purpose as historical fact). Both
 * cases call the exact same route/flow — this is not a second conversion
 * mechanism, just a different label for the same button so the admin
 * understands they're re-linking, not converting for the first time.
 *
 * On success, router.refresh() re-fetches the request server-side — its
 * clientId is now set again, so the parent page swaps this button for the
 * "Cliente asociado" block on the next render, same as ConversationActions'
 * "Cliente vinculado" swap.
 */
export function ContactRequestConvertClientButton({
  contactRequestId,
  label = "Agregar cliente",
}: {
  contactRequestId: string;
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    setError(null);

    const outcome = await requestConvertContactRequestToClient(contactRequestId);

    if (outcome.status === "success") {
      router.refresh();
      return;
    }
    setError(CONVERT_ERROR_MESSAGES[outcome.code]);
    setLoading(false);
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-bg-raised px-3 py-2 text-sm text-fg transition-colors hover:border-border-accent disabled:cursor-default disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <UserPlus className="size-4" aria-hidden="true" />
        )}
        {label}
      </button>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}

export type DeleteContactRequestErrorCode = "not_found" | "unauthorized" | "generic";

export type DeleteContactRequestOutcome =
  | { status: "success" }
  | { status: "error"; code: DeleteContactRequestErrorCode };

/**
 * "Eliminar solicitud" — same dependency-injectable, unit-testable shape
 * as requestDeleteClient()/requestDeleteConversation(). No protection
 * codes to map here (unlike those two): deleting a contact request is
 * always allowed, regardless of status/client_id — see DELETE
 * /api/admin/contact-requests/[id]'s doc comment for why.
 */
export async function requestDeleteContactRequest(
  contactRequestId: string,
  fetchImpl: typeof fetch = fetch
): Promise<DeleteContactRequestOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/admin/contact-requests/${contactRequestId}`, { method: "DELETE" });
  } catch {
    return { status: "error", code: "generic" };
  }

  const body = (await res.json().catch(() => ({}))) as { ok?: boolean };

  if (res.ok && body.ok) return { status: "success" };
  if (res.status === 401) return { status: "error", code: "unauthorized" };
  if (res.status === 404) return { status: "error", code: "not_found" };
  return { status: "error", code: "generic" };
}

const DELETE_ERROR_MESSAGES: Record<DeleteContactRequestErrorCode, string> = {
  not_found: "Esta solicitud ya no existe.",
  unauthorized: "Tu sesión expiró — recarga la página e inicia sesión de nuevo.",
  generic: "No pudimos eliminar la solicitud. Intenta de nuevo.",
};

/**
 * Same "arm then confirm" two-click pattern as ClientActions/
 * ConversationActions' delete buttons — nothing is deleted on the first
 * click, only on the second, explicit one. Deleting the request never
 * touches its linked client (if any) — see the route's doc comment; no
 * client-related warning is ever needed here.
 */
export function ContactRequestDeleteButton({ contactRequestId }: { contactRequestId: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    const outcome = await requestDeleteContactRequest(contactRequestId);

    if (outcome.status === "success") {
      router.push("/admin/contact-requests");
      return;
    }

    setError(DELETE_ERROR_MESSAGES[outcome.code]);
    setArmed(false);
    setDeleting(false);
  }

  return (
    <div>
      {armed && !deleting && (
        <p className="mb-2 max-w-md text-xs text-error">
          ¿Eliminar esta solicitud? Esta acción eliminará permanentemente la solicitud y no se puede
          deshacer.
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
          {armed ? "Confirmar eliminación" : "Eliminar solicitud"}
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
