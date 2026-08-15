import { describe, it, expect } from "vitest";
import {
  classifyLeadActivity,
  buildLeadActivityStats,
  ACTIVE_LEAD_MAX_INACTIVITY_DAYS,
  STALE_LEAD_MIN_INACTIVITY_DAYS,
} from "@/lib/statistics/leadActivity";
import type { Conversation } from "@/lib/db/types";

const NOW = new Date("2026-08-12T12:00:00.000Z");

function iso(daysAgo: number): string {
  return new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv-1",
    sessionId: "session-1",
    locale: "es",
    createdAt: iso(0),
    updatedAt: iso(0),
    status: "active",
    messages: [],
    clientId: null,
    convertedAt: null,
    promotionId: null,
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

describe("classifyLeadActivity — umbrales", () => {
  it(`updated hace ${ACTIVE_LEAD_MAX_INACTIVITY_DAYS} días exactos → active (límite inclusivo)`, () => {
    const c = makeConversation({ leadStatus: "interested", updatedAt: iso(ACTIVE_LEAD_MAX_INACTIVITY_DAYS) });
    expect(classifyLeadActivity(c, NOW)).toBe("active");
  });

  it(`updated hace ${STALE_LEAD_MIN_INACTIVITY_DAYS} días exactos → stalled (límite inclusivo)`, () => {
    const c = makeConversation({ leadStatus: "interested", updatedAt: iso(STALE_LEAD_MIN_INACTIVITY_DAYS) });
    expect(classifyLeadActivity(c, NOW)).toBe("stalled");
  });

  it("updated hace 10 días (entre los dos umbrales) → cooling, ni active ni stalled", () => {
    const c = makeConversation({ leadStatus: "interested", updatedAt: iso(10) });
    expect(classifyLeadActivity(c, NOW)).toBe("cooling");
  });

  it("updated hace 1 día → active", () => {
    const c = makeConversation({ leadStatus: "hot", updatedAt: iso(1) });
    expect(classifyLeadActivity(c, NOW)).toBe("active");
  });

  it("updated hace 30 días → stalled", () => {
    const c = makeConversation({ leadStatus: "exploring", updatedAt: iso(30) });
    expect(classifyLeadActivity(c, NOW)).toBe("stalled");
  });
});

describe("classifyLeadActivity — client/support fuera del pipeline comercial", () => {
  it("leadStatus 'client' → out_of_pipeline, sin importar hace cuánto se actualizó", () => {
    const c = makeConversation({ leadStatus: "client", updatedAt: iso(1) });
    expect(classifyLeadActivity(c, NOW)).toBe("out_of_pipeline");
  });

  it("leadStatus 'support' → out_of_pipeline, incluso recién actualizado", () => {
    const c = makeConversation({ leadStatus: "support", updatedAt: iso(0) });
    expect(classifyLeadActivity(c, NOW)).toBe("out_of_pipeline");
  });
});

describe("buildLeadActivityStats", () => {
  it("clasifica correctamente una mezcla de leads activos/cooling/estancados/fuera de pipeline", () => {
    const conversations = [
      makeConversation({ id: "a", leadStatus: "exploring", updatedAt: iso(1) }), // active
      makeConversation({ id: "b", leadStatus: "interested", updatedAt: iso(2) }), // active
      makeConversation({ id: "c", leadStatus: "hot", updatedAt: iso(10) }), // cooling
      makeConversation({ id: "d", leadStatus: "interested", updatedAt: iso(20) }), // stalled
      makeConversation({ id: "e", leadStatus: "client", updatedAt: iso(0) }), // out_of_pipeline
      makeConversation({ id: "f", leadStatus: "support", updatedAt: iso(0) }), // out_of_pipeline
    ];

    const stats = buildLeadActivityStats(conversations, NOW);

    expect(stats.activeCount).toBe(2);
    expect(stats.coolingCount).toBe(1);
    expect(stats.stalledCount).toBe(1);
    expect(stats.outOfPipelineCount).toBe(2);
    expect(stats.totalInPipeline).toBe(4); // active + cooling + stalled, nunca client/support
  });

  it("averageDaysSinceActivity solo promedia leads en pipeline, nunca client/support", () => {
    const conversations = [
      makeConversation({ id: "a", leadStatus: "exploring", updatedAt: iso(2) }),
      makeConversation({ id: "b", leadStatus: "interested", updatedAt: iso(4) }),
      makeConversation({ id: "c", leadStatus: "client", updatedAt: iso(100) }), // excluido — no debe arrastrar el promedio
    ];
    const stats = buildLeadActivityStats(conversations, NOW);
    expect(stats.averageDaysSinceActivity).toBe(3); // (2+4)/2, no (2+4+100)/3
  });

  it("array vacío → todos los conteos en 0, promedio null (nunca NaN)", () => {
    const stats = buildLeadActivityStats([], NOW);
    expect(stats.activeCount).toBe(0);
    expect(stats.stalledCount).toBe(0);
    expect(stats.totalInPipeline).toBe(0);
    expect(stats.averageDaysSinceActivity).toBeNull();
    expect(Number.isNaN(stats.averageDaysSinceActivity)).toBe(false);
  });

  it("solo conversaciones client/support → totalInPipeline 0, averageDaysSinceActivity null (no NaN)", () => {
    const conversations = [
      makeConversation({ id: "a", leadStatus: "client" }),
      makeConversation({ id: "b", leadStatus: "support" }),
    ];
    const stats = buildLeadActivityStats(conversations, NOW);
    expect(stats.totalInPipeline).toBe(0);
    expect(stats.averageDaysSinceActivity).toBeNull();
  });
});
