import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MessageCircle } from "lucide-react";
import { getConversationById } from "@/lib/db/conversationStore";
import { LeadStatusBadge } from "@/components/admin/LeadStatusBadge";
import { ConversationActions } from "@/components/admin/ConversationActions";
import { ChatMessageBubble } from "@/components/ai/ChatMessageBubble";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const FIELD_LABELS: Record<string, string> = {
  website: "Web",
  projectType: "Tipo de proyecto",
  need: "Necesidad",
  goal: "Objetivo",
  budget: "Presupuesto",
  urgency: "Urgencia",
};

export default async function ConversationDetailPage({ params }: PageProps) {
  const { id } = await params;
  const conversation = await getConversationById(id);
  if (!conversation) notFound();

  const detectedFields = (
    ["website", "projectType", "need", "goal", "budget", "urgency"] as const
  )
    .map((key) => ({ key, label: FIELD_LABELS[key], value: conversation[key] }))
    .filter((f) => f.value);

  return (
    <div>
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-fg">
            {conversation.visitorName || "Visitante anónimo"}
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            {conversation.company || "Sin empresa"} · {conversation.locale.toUpperCase()} ·{" "}
            {new Date(conversation.createdAt).toLocaleString("es-CO")}
          </p>
        </div>
        <LeadStatusBadge status={conversation.leadStatus} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {conversation.visitorEmail && (
          <a
            href={`mailto:${conversation.visitorEmail}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-bg-raised px-3 py-2 text-sm text-fg transition-colors hover:border-border-accent"
          >
            <Mail className="size-4" aria-hidden="true" />
            {conversation.visitorEmail}
          </a>
        )}
        {conversation.visitorPhone && (
          <a
            href={`https://wa.me/${conversation.visitorPhone.replace(/[^0-9]/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-bg-raised px-3 py-2 text-sm text-fg transition-colors hover:border-border-accent"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Contactar por WhatsApp
          </a>
        )}
        <ConversationActions conversationId={conversation.id} currentStatus={conversation.leadStatus} />
      </div>

      {conversation.aiSummary && (
        <div className="mt-8 rounded-lg border border-border-accent bg-bg-raised p-5">
          <p className="font-mono text-xs uppercase tracking-[0.1em] text-accent-300">
            Resumen IA
          </p>
          <p className="mt-2 text-sm text-fg-muted">{conversation.aiSummary}</p>
        </div>
      )}

      {detectedFields.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {detectedFields.map((f) => (
            <div key={f.key} className="rounded-lg border border-border bg-bg-raised p-4">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">
                {f.label}
              </p>
              <p className="mt-1 text-sm text-fg">{f.value}</p>
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-10 text-base font-semibold text-fg">Conversación completa</h2>
      <div className="mt-4 space-y-4 rounded-lg border border-border bg-bg-elevated/40 p-5">
        {conversation.messages.length === 0 && (
          <p className="text-sm text-fg-subtle">Sin mensajes.</p>
        )}
        {conversation.messages.map((m, i) => (
          <ChatMessageBubble key={i} message={m} />
        ))}
      </div>
    </div>
  );
}
