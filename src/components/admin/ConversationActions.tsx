"use client";

import { useState } from "react";
import { CheckCircle2, FolderPlus, Loader2 } from "lucide-react";

export type ConvertClientErrorCode =
  | "missing_email"
  | "missing_name_and_company"
  | "unauthorized"
  | "not_found"
  | "generic";

export type ConvertClientOutcome =
  | { status: "success"; clientId: string; created: boolean }
  | { status: "error"; code: ConvertClientErrorCode };

/**
 * Calls Fase 2's POST /api/admin/conversations/[id]/convert-client and
 * interprets its response into a small discriminated result. Kept as a
 * standalone, dependency-injectable function (rather than inlined in the
 * click handler) specifically so it's unit-testable without rendering the
 * component — this project has no component-rendering/interaction test
 * infrastructure installed (no @testing-library/react, no jsdom; see
 * __tests__/ConversationActions.test.ts for the note on that gap).
 *
 * Never surfaces raw response text to the caller — only ever one of the
 * fixed codes below, which the component maps to a pre-written, safe
 * message (see ERROR_MESSAGES).
 */
export async function requestConvertToClient(
  conversationId: string,
  fetchImpl: typeof fetch = fetch
): Promise<ConvertClientOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/admin/conversations/${conversationId}/convert-client`, {
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
  if (body.error === "missing_email") return { status: "error", code: "missing_email" };
  if (body.error === "missing_name_and_company") {
    return { status: "error", code: "missing_name_and_company" };
  }
  if (res.status === 404) return { status: "error", code: "not_found" };

  return { status: "error", code: "generic" };
}

const ERROR_MESSAGES: Record<ConvertClientErrorCode, string> = {
  missing_email: "Este lead no tiene email registrado — agrégalo antes de convertir.",
  missing_name_and_company: "Este lead no tiene nombre ni empresa registrados — no se puede convertir.",
  unauthorized: "Tu sesión expiró — recarga la página e inicia sesión de nuevo.",
  not_found: "No pudimos encontrar esta conversación.",
  generic: "No pudimos completar la conversión. Intenta de nuevo.",
};

export function ConversationActions({
  conversationId,
  clientId,
}: {
  conversationId: string;
  clientId: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [linkedClientId, setLinkedClientId] = useState(clientId);
  const [confirmation, setConfirmation] = useState<"created" | "existing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectNote, setProjectNote] = useState(false);

  async function handleConvert() {
    if (loading) return; // ignore a second click while a request is already in flight
    setLoading(true);
    setError(null);
    setConfirmation(null);

    const outcome = await requestConvertToClient(conversationId);

    if (outcome.status === "success") {
      setLinkedClientId(outcome.clientId);
      setConfirmation(outcome.created ? "created" : "existing");
    } else {
      setError(ERROR_MESSAGES[outcome.code]);
    }

    setLoading(false);
  }

  return (
    <>
      {linkedClientId ? (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-bg-raised px-3 py-2 text-sm text-fg-muted">
          <CheckCircle2 className="size-4 text-accent-400" aria-hidden="true" />
          Cliente vinculado
        </span>
      ) : (
        <button
          type="button"
          onClick={handleConvert}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-bg-raised px-3 py-2 text-sm text-fg transition-colors hover:border-border-accent disabled:cursor-default disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="size-4" aria-hidden="true" />
          )}
          Convertir en cliente
        </button>
      )}

      {confirmation && (
        <p className="w-full text-xs text-accent-300">
          {confirmation === "created" ? "Cliente creado." : "Cliente ya existente — vinculado."}
        </p>
      )}
      {error && <p className="w-full text-xs text-error">{error}</p>}

      <button
        type="button"
        onClick={() => setProjectNote(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-bg-raised px-3 py-2 text-sm text-fg-muted transition-colors hover:border-border-accent hover:text-fg"
      >
        <FolderPlus className="size-4" aria-hidden="true" />
        Convertir en proyecto
      </button>
      {projectNote && (
        <p className="w-full text-xs text-fg-subtle">
          La gestión de proyectos llega en una próxima versión — por ahora, convierte el lead en
          cliente y da seguimiento manual.
        </p>
      )}
    </>
  );
}
