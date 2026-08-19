import { describe, it, expect } from "vitest";
import { buildActivityFeed } from "@/lib/clients/activity";
import type { Conversation, MaintenanceRequest } from "@/lib/db/types";
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
});
