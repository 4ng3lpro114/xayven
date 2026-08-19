import { describe, it, expect } from "vitest";
import { buildActivityFeed } from "@/lib/clients/activity";
import type { ClientNote, Conversation, ContactRequest, LeadStatusHistoryEntry, MaintenanceRequest } from "@/lib/db/types";
import type { Payment, Project } from "@/lib/payments/types";

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv-1",
    sessionId: "s-1",
    locale: "es",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "active",
    messages: [],
    clientId: "client-1",
    convertedAt: null,
    promotionId: null,
    servicePageSlug: null,
    visitorName: null,
    visitorEmail: null,
    visitorPhone: null,
    company: null,
    website: null,
    projectType: null,
    need: null,
    goal: null,
    budget: null,
    urgency: null,
    leadScore: 0,
    leadStatus: "exploring",
    aiSummary: null,
    consentStatus: "pending",
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    clientId: "client-1",
    name: "Proyecto X",
    status: "awaiting_payment",
    currency: "COP",
    totalAmount: 1000,
    paidAmount: 0,
    portalToken: "token",
    ...overrides,
  };
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "payment-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    projectId: "project-1",
    clientId: "client-1",
    provider: "WOMPI",
    providerTransactionId: null,
    reference: "REF-1",
    amount: 500,
    currency: "COP",
    status: "APPROVED",
    paymentType: "DEPOSIT",
    metadata: {},
    ...overrides,
  };
}

function makeMaintenanceRequest(overrides: Partial<MaintenanceRequest> = {}): MaintenanceRequest {
  return {
    id: "maintenance-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    name: "Diana",
    email: "diana@example.com",
    company: null,
    website: "https://example.com",
    need: "Actualizar contenido",
    priority: "normal",
    message: "Necesito actualizar mi sitio.",
    status: "new",
    clientId: "client-1",
    ...overrides,
  };
}

function makeContactRequest(overrides: Partial<ContactRequest> = {}): ContactRequest {
  return {
    id: "request-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    name: "Diana",
    email: "diana@example.com",
    company: null,
    projectType: "Sitio web nuevo",
    budget: "USD 1,000 - 3,000",
    message: "Quiero un sitio nuevo.",
    status: "converted",
    clientId: "client-1",
    clientWasCreated: true,
    pricingCatalogId: null,
    marketCode: null,
    displayCurrency: null,
    officialAmount: null,
    officialCurrency: null,
    ...overrides,
  };
}

function makeLeadStatusHistoryEntry(
  overrides: Partial<LeadStatusHistoryEntry> = {}
): LeadStatusHistoryEntry {
  return {
    id: "history-1",
    conversationId: "conv-1",
    clientId: "client-1",
    fromStatus: "exploring",
    toStatus: "interested",
    changedAt: "2026-01-01T00:00:00.000Z",
    changedBy: "ai",
    source: "ai_chat_turn",
    metadata: {},
    ...overrides,
  };
}

function makeClientNote(overrides: Partial<ClientNote> = {}): ClientNote {
  return {
    id: "note-1",
    clientId: "client-1",
    body: "Llamó para preguntar por el estado del proyecto.",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildActivityFeed", () => {
  it("combina conversaciones, proyectos y pagos, ordenados del más reciente al más antiguo", () => {
    const feed = buildActivityFeed({
      conversations: [makeConversation({ id: "c1", updatedAt: "2026-01-01T00:00:00.000Z" })],
      projects: [makeProject({ id: "p1", updatedAt: "2026-03-01T00:00:00.000Z" })],
      payments: [makePayment({ id: "pay1", updatedAt: "2026-02-01T00:00:00.000Z" })],
    });

    expect(feed.map((i) => i.id)).toEqual(["p1", "pay1", "c1"]);
  });

  it("no inventa actividad — un feed vacío da un arreglo vacío, no un item falso", () => {
    const feed = buildActivityFeed({ conversations: [], projects: [], payments: [] });

    expect(feed).toEqual([]);
  });

  it("cada item conserva su tipo correcto", () => {
    const feed = buildActivityFeed({
      conversations: [makeConversation()],
      projects: [makeProject()],
      payments: [makePayment()],
    });

    expect(feed.map((i) => i.type).sort()).toEqual(["conversation", "payment", "project"]);
  });

  describe("XAYVEN CORE Phase 2 — maintenanceRequests", () => {
    it("maintenanceRequests omitido → comportamiento idéntico a antes de esta fase (sin items 'maintenance')", () => {
      const feed = buildActivityFeed({
        conversations: [makeConversation()],
        projects: [],
        payments: [],
      });

      expect(feed.map((i) => i.type)).toEqual(["conversation"]);
    });

    it("una maintenance request real aparece en el feed con type 'maintenance', usando createdAt como timestamp", () => {
      const feed = buildActivityFeed({
        conversations: [],
        projects: [],
        payments: [],
        maintenanceRequests: [makeMaintenanceRequest({ id: "m1", createdAt: "2026-05-01T00:00:00.000Z" })],
      });

      expect(feed).toHaveLength(1);
      expect(feed[0]).toMatchObject({ type: "maintenance", id: "m1", timestamp: "2026-05-01T00:00:00.000Z" });
    });

    it("se intercala correctamente con conversaciones/proyectos/pagos por fecha, no siempre al final", () => {
      const feed = buildActivityFeed({
        conversations: [makeConversation({ id: "c1", updatedAt: "2026-01-01T00:00:00.000Z" })],
        projects: [makeProject({ id: "p1", updatedAt: "2026-03-01T00:00:00.000Z" })],
        payments: [],
        maintenanceRequests: [makeMaintenanceRequest({ id: "m1", createdAt: "2026-02-01T00:00:00.000Z" })],
      });

      expect(feed.map((i) => i.id)).toEqual(["p1", "m1", "c1"]);
    });

    it("maintenanceRequests vacío → ningún item 'maintenance' inventado", () => {
      const feed = buildActivityFeed({
        conversations: [],
        projects: [],
        payments: [],
        maintenanceRequests: [],
      });

      expect(feed).toEqual([]);
    });
  });

  describe("XAYVEN CORE Phase 3.6 — contactRequests / leadStatusHistory / notes", () => {
    it("las 3 fuentes omitidas → comportamiento idéntico a antes de esta fase (ningún item nuevo)", () => {
      const feed = buildActivityFeed({
        conversations: [makeConversation()],
        projects: [],
        payments: [],
      });

      expect(feed.map((i) => i.type)).toEqual(["conversation"]);
    });

    it("una contact_request real aparece con type 'contact_request', usando createdAt como timestamp", () => {
      const feed = buildActivityFeed({
        conversations: [],
        projects: [],
        payments: [],
        contactRequests: [makeContactRequest({ id: "r1", createdAt: "2026-04-01T00:00:00.000Z", projectType: "Tienda online" })],
      });

      expect(feed).toHaveLength(1);
      expect(feed[0]).toMatchObject({
        type: "contact_request",
        id: "r1",
        timestamp: "2026-04-01T00:00:00.000Z",
        label: "Solicitud — Tienda online",
      });
    });

    it("una transición de lead_status_history real aparece con type 'status_change', usando changedAt", () => {
      const feed = buildActivityFeed({
        conversations: [],
        projects: [],
        payments: [],
        leadStatusHistory: [
          makeLeadStatusHistoryEntry({
            id: "h1",
            changedAt: "2026-04-02T00:00:00.000Z",
            fromStatus: "exploring",
            toStatus: "interested",
          }),
        ],
      });

      expect(feed).toHaveLength(1);
      expect(feed[0]).toMatchObject({
        type: "status_change",
        id: "h1",
        timestamp: "2026-04-02T00:00:00.000Z",
        label: "Cambió de Explorando a Interesado",
      });
    });

    it("fromStatus null se etiqueta como estado inicial, nunca lanza ni se omite", () => {
      const feed = buildActivityFeed({
        conversations: [],
        projects: [],
        payments: [],
        leadStatusHistory: [makeLeadStatusHistoryEntry({ id: "h1", fromStatus: null, toStatus: "hot" })],
      });

      expect(feed[0]).toMatchObject({ label: "Estado inicial — Caliente" });
    });

    it("una nota real aparece con type 'note', label fijo 'Nota interna' — el feed nunca expone el body", () => {
      const feed = buildActivityFeed({
        conversations: [],
        projects: [],
        payments: [],
        notes: [makeClientNote({ id: "n1", createdAt: "2026-04-03T00:00:00.000Z", body: "Contenido privado del cliente" })],
      });

      expect(feed).toHaveLength(1);
      expect(feed[0]).toMatchObject({ type: "note", id: "n1", timestamp: "2026-04-03T00:00:00.000Z", label: "Nota interna" });
      expect(JSON.stringify(feed)).not.toContain("Contenido privado del cliente");
    });

    it("las 3 fuentes nuevas se intercalan correctamente por fecha junto con las 4 existentes", () => {
      const feed = buildActivityFeed({
        conversations: [makeConversation({ id: "c1", updatedAt: "2026-01-01T00:00:00.000Z" })],
        projects: [makeProject({ id: "p1", updatedAt: "2026-06-01T00:00:00.000Z" })],
        payments: [],
        maintenanceRequests: [makeMaintenanceRequest({ id: "m1", createdAt: "2026-02-01T00:00:00.000Z" })],
        contactRequests: [makeContactRequest({ id: "r1", createdAt: "2026-05-01T00:00:00.000Z" })],
        leadStatusHistory: [makeLeadStatusHistoryEntry({ id: "h1", changedAt: "2026-04-01T00:00:00.000Z" })],
        notes: [makeClientNote({ id: "n1", createdAt: "2026-03-01T00:00:00.000Z" })],
      });

      expect(feed.map((i) => i.id)).toEqual(["p1", "r1", "h1", "n1", "m1", "c1"]);
    });

    it("cada fuente nueva vacía → ningún item inventado", () => {
      const feed = buildActivityFeed({
        conversations: [],
        projects: [],
        payments: [],
        contactRequests: [],
        leadStatusHistory: [],
        notes: [],
      });

      expect(feed).toEqual([]);
    });
  });
});
