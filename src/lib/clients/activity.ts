import type { Conversation, ClientNote, ContactRequest, LeadStatus, LeadStatusHistoryEntry, MaintenanceRequest } from "@/lib/db/types";
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
 *
 * XAYVEN CORE Phase 3.6 — three more optional sources, closing the gap the
 * Phase 3.6 CRM/Admin audit found: `contactRequests` was already fetched
 * by /admin/clients/[id]/page.tsx but never fed into this feed;
 * `leadStatusHistory` reuses `listAllLeadStatusHistory()`
 * (conversationStore.ts), which already existed for Analytics V2 but was
 * never read by the Admin UI; `notes` is the new client_notes entity (see
 * clientNoteStore.ts). Same "optional param, omitted callers keep today's
 * exact behavior" discipline as `maintenanceRequests` above — none of the
 * 4 existing sources' timestamp/label semantics change.
 */

export type ActivityItemType =
  | "conversation"
  | "project"
  | "payment"
  | "maintenance"
  | "contact_request"
  | "status_change"
  | "note";

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
  /** Phase 3.6 — optional, same omission discipline as above. Only
   *  `contact_requests` with `status: "converted"` for THIS client ever
   *  reach here in practice (same filtering the client detail page
   *  already applies before calling this function) — this function still
   *  never re-filters by clientId itself, same rule as every other param. */
  contactRequests?: ContactRequest[];
  /** Phase 3.6 — optional. Real transitions only (`fromStatus !==
   *  toStatus`, enforced at the source by changeLeadStatus() — never a
   *  synthesized "creation" event, see lead_status_history's own doc
   *  comment in db/types.ts). */
  leadStatusHistory?: LeadStatusHistoryEntry[];
  /** Phase 3.6 — optional. client_notes rows for this client. */
  notes?: ClientNote[];
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
    ...(params.contactRequests ?? []).map(
      (r): ActivityItem => ({
        type: "contact_request",
        id: r.id,
        timestamp: r.createdAt,
        label: `Solicitud — ${r.projectType}`,
      })
    ),
    ...(params.leadStatusHistory ?? []).map(
      (h): ActivityItem => ({
        type: "status_change",
        id: h.id,
        timestamp: h.changedAt,
        label: h.fromStatus
          ? `Cambió de ${LEAD_STATUS_LABELS_ES[h.fromStatus]} a ${LEAD_STATUS_LABELS_ES[h.toStatus]}`
          : `Estado inicial — ${LEAD_STATUS_LABELS_ES[h.toStatus]}`,
      })
    ),
    ...(params.notes ?? []).map(
      (n): ActivityItem => ({
        type: "note",
        id: n.id,
        timestamp: n.createdAt,
        label: "Nota interna",
      })
    ),
  ];

  return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
