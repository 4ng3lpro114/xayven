"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FolderPlus, Loader2 } from "lucide-react";
import type { LeadStatus } from "@/lib/db/types";

export function ConversationActions({
  conversationId,
  currentStatus,
}: {
  conversationId: string;
  currentStatus: LeadStatus;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [projectNote, setProjectNote] = useState(false);

  async function markAsClient() {
    setLoading(true);
    try {
      await fetch(`/api/admin/conversations/${conversationId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "client" }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={markAsClient}
        disabled={loading || currentStatus === "client"}
        className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-bg-raised px-3 py-2 text-sm text-fg transition-colors hover:border-border-accent disabled:cursor-default disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="size-4" aria-hidden="true" />
        )}
        {currentStatus === "client" ? "Ya es cliente" : "Marcar como cliente"}
      </button>

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
          La gestión de proyectos llega en una próxima versión — por ahora, marca el lead como
          cliente y da seguimiento manual.
        </p>
      )}
    </>
  );
}
