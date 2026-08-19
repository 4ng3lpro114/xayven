"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import type { ClientNote } from "@/lib/db/types";

/**
 * XAYVEN CORE Phase 3.6 — "Notas" section on /admin/clients/[id]. One
 * component handles both create and delete (mirrors ClientActions.tsx,
 * which does the same for promote/delete) because both mutations need to
 * refresh the same list — splitting into two components would just mean
 * duplicating the loading/error/router.refresh() plumbing.
 *
 * This is the ONLY place that shows a note's actual content — the
 * "Actividad reciente" feed only ever shows the fixed label "Nota
 * interna" (see buildActivityFeed()), by design (Phase 3.6 plan).
 *
 * No edit — deliberately out of scope. `router.refresh()` re-runs the
 * Server Component tree (same pattern as ClientActions.tsx), which is
 * what keeps `notes` (passed in as a prop from the page's own
 * listClientNotes() call) in sync after a create or delete — this
 * component never manages its own source-of-truth copy of the list.
 */
export function ClientNotes({ clientId, notes }: { clientId: string; notes: ClientNote[] }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const trimmed = body.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/clients/${clientId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });

      if (!res.ok) {
        setError("No pudimos guardar la nota. Intenta de nuevo.");
        setSubmitting(false);
        return;
      }

      setBody("");
      router.refresh();
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(noteId: string) {
    if (deletingId) return;
    setDeletingId(noteId);
    setError(null);

    try {
      const res = await fetch(`/api/admin/clients/${clientId}/notes/${noteId}`, { method: "DELETE" });
      if (!res.ok) {
        setError("No pudimos eliminar la nota. Intenta de nuevo.");
        setDeletingId(null);
        return;
      }
      router.refresh();
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Escribe una nota interna sobre este cliente…"
          className="w-full rounded-md border border-border-strong bg-bg-elevated px-4 py-3 text-sm text-fg placeholder:text-fg-subtle focus:border-accent-400 focus:outline-none"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting || !body.trim()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-bg-raised px-3 py-2 text-sm text-fg-muted transition-colors hover:border-border-accent hover:text-fg disabled:cursor-default disabled:opacity-50"
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Guardar nota
          </button>
          {error && <p className="text-xs text-error">{error}</p>}
        </div>
      </form>

      <div className="space-y-2.5">
        {notes.length === 0 ? (
          <p className="text-sm text-fg-subtle">Sin notas todavía.</p>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-bg-elevated/40 px-4 py-3"
            >
              <div>
                <p className="whitespace-pre-wrap text-sm text-fg-muted">{note.body}</p>
                <p className="mt-1.5 text-xs text-fg-subtle">
                  {new Date(note.createdAt).toLocaleString("es-CO")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(note.id)}
                disabled={deletingId === note.id}
                aria-label="Eliminar nota"
                className="shrink-0 rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-error/10 hover:text-error disabled:cursor-default disabled:opacity-50"
              >
                {deletingId === note.id ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
