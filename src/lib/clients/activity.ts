import type { Conversation, LeadStatus, MaintenanceRequest } from "@/lib/db/types";
import type { Payment, Project } from "@/lib/payments/types";

/**
 * "Actividad reciente" (Fase 5C, Etapa 8) — merges a client's
 * conversations, projects, payments, and (XAYVEN CORE Phase 2)
 * maintenance requests into one chronological feed. Pure, no I/O. Never
 * fabricates anything: an item only appears here if it's a real row
 * already returned by listConversations/listProjects/listPayments/
 * listMaintenanceRequests, filtered to this client's clientId by the
 * caller — this function never does that filtering itself.
 *
 * `maintenance_requests` has no `updated_at` column (see 0001_init.sql —
 * it's never mutated after creation, no status-change action exists for
 * it yet) — `createdAt` is used as its timestamp here, unlike
 * conversations/projects/payments which all use `updatedAt`. This is
 * correct today (createdAt IS the only real timestamp this row will ever
 * have) but would need revisiting if a status-change action is ever added.
 */

export type ActivityItemType = "conversation" | "project" | "payment" | "maintenance";

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

const MAINTENANCE_STATUS_LABELS_ES: Record<MaintenanceRequest["status"], string> = {
  new: "Nueva",
  contacted: "Contactada",
  resolved: "Resuelta",
};

export function buildActivityFeed(params: {
  conversations: Conversation[];
  projects: Project[];
  payments: Payment[];
  /** Optional — omitted callers (existing tests, any future caller that
   *  doesn't have this data loaded) keep today's exact behavior (no
   *  maintenance items in the feed). */
  maintenanceRequests?: MaintenanceRequest[];
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
    ...(params.maintenanceRequests ?? []).map(
      (m): ActivityItem => ({
        type: "maintenance",
        id: m.id,
        timestamp: m.createdAt,
        label: `Mantenimiento — ${MAINTENANCE_STATUS_LABELS_ES[m.status]}`,
      })
    ),
  ];

  return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
