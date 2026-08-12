import type { Conversation, LeadStatus } from "@/lib/db/types";
import type { Payment, Project } from "@/lib/payments/types";

/**
 * "Actividad reciente" (Fase 5C, Etapa 8) — merges a client's
 * conversations, projects, and payments into one chronological feed. Pure,
 * no I/O. Never fabricates anything: an item only appears here if it's a
 * real row already returned by listConversations/listProjects/
 * listPayments — nothing about "maintenance" is included, since
 * maintenance_requests has no relation to clients (see Fase 5A audit).
 */

export type ActivityItemType = "conversation" | "project" | "payment";

export interface ActivityItem {
  type: ActivityItemType;
  id: string;
  /** ISO timestamp used both for sorting and display. */
  timestamp: string;
  label: string;
}

const LEAD_STATUS_LABELS_ES: Record<LeadStatus, string> = {
  exploring: "Explorando",
  interested: "Interesado",
  hot: "Caliente",
  client: "Cliente",
  support: "Soporte",
};

export function buildActivityFeed(params: {
  conversations: Conversation[];
  projects: Project[];
  payments: Payment[];
}): ActivityItem[] {
  const items: ActivityItem[] = [
    ...params.conversations.map(
      (c): ActivityItem => ({
        type: "conversation",
        id: c.id,
        timestamp: c.updatedAt,
        label: `Conversación — ${LEAD_STATUS_LABELS_ES[c.leadStatus]}`,
      })
    ),
    ...params.projects.map(
      (p): ActivityItem => ({
        type: "project",
        id: p.id,
        timestamp: p.updatedAt,
        label: `Proyecto "${p.name}" — ${p.status}`,
      })
    ),
    ...params.payments.map(
      (p): ActivityItem => ({
        type: "payment",
        id: p.id,
        timestamp: p.updatedAt,
        label: `Pago ${p.provider} — ${p.status}`,
      })
    ),
  ];

  return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
