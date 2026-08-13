import { describe, it, expect } from "vitest";
import {
  buildConversionVelocityStats,
  MIN_SAMPLE_SIZE_FOR_VELOCITY_STATS,
} from "@/lib/statistics/conversionVelocity";
import type { Conversation, LeadStatusHistoryEntry } from "@/lib/db/types";

const BASE_TIME = new Date("2026-08-12T00:00:00.000Z").getTime();
const HOUR_MS = 60 * 60 * 1000;

function at(hoursFromBase: number): string {
  return new Date(BASE_TIME + hoursFromBase * HOUR_MS).toISOString();
}

function makeConversation(id: string, createdAtHours: number): Pick<Conversation, "id" | "createdAt"> {
  return { id, createdAt: at(createdAtHours) };
}

let historyIdCounter = 0;
function makeHistoryEntry(overrides: Partial<LeadStatusHistoryEntry>): LeadStatusHistoryEntry {
  historyIdCounter += 1;
  return {
    id: `history-${historyIdCounter}`,
    conversationId: "conv-1",
    clientId: null,
    fromStatus: null,
    toStatus: "interested",
    changedAt: at(1),
    changedBy: "ai",
    source: "ai_chat_turn",
    metadata: {},
    ...overrides,
  };
}

describe("buildConversionVelocityStats — history vacío", () => {
  it("[] → hasAnyHistoryData false, todas las duraciones en 0 sin lanzar ni NaN", () => {
    const stats = buildConversionVelocityStats([], []);
    expect(stats.hasAnyHistoryData).toBe(false);
    for (const bucket of [
      stats.exploringToInterested,
      stats.interestedToHot,
      stats.hotToClient,
      stats.totalTimeToConversion,
    ]) {
      expect(bucket.sampleSize).toBe(0);
      expect(bucket.averageHours).toBeNull();
      expect(bucket.medianHours).toBeNull();
      expect(bucket.isRepresentative).toBe(false);
    }
  });
});

describe("buildConversionVelocityStats — exploring → interested (medido desde conversations.createdAt)", () => {
  it("una sola conversación: created en 0h, transición a interested en 10h → 10h de duración", () => {
    const conversations = [makeConversation("conv-1", 0)];
    const history = [
      makeHistoryEntry({ conversationId: "conv-1", fromStatus: "exploring", toStatus: "interested", changedAt: at(10) }),
    ];

    const stats = buildConversionVelocityStats(history, conversations);
    expect(stats.exploringToInterested.sampleSize).toBe(1);
    expect(stats.exploringToInterested.averageHours).toBe(10);
    expect(stats.exploringToInterested.medianHours).toBe(10);
  });
});

describe("buildConversionVelocityStats — interested → hot y hot → client (medidos entre filas consecutivas)", () => {
  it("secuencia completa exploring→interested→hot→client mide cada tramo por separado", () => {
    const conversations = [makeConversation("conv-1", 0)];
    const history = [
      makeHistoryEntry({ conversationId: "conv-1", fromStatus: "exploring", toStatus: "interested", changedAt: at(5) }),
      makeHistoryEntry({ conversationId: "conv-1", fromStatus: "interested", toStatus: "hot", changedAt: at(15) }),
      makeHistoryEntry({ conversationId: "conv-1", fromStatus: "hot", toStatus: "client", changedAt: at(20), source: "lead_conversion" }),
    ];

    const stats = buildConversionVelocityStats(history, conversations);
    expect(stats.exploringToInterested.averageHours).toBe(5); // 5 - 0
    expect(stats.interestedToHot.averageHours).toBe(10); // 15 - 5
    expect(stats.hotToClient.averageHours).toBe(5); // 20 - 15
    expect(stats.totalTimeToConversion.averageHours).toBe(20); // 20 - 0 (creación → cliente)
  });
});

describe("buildConversionVelocityStats — mediana", () => {
  it("mediana con número impar de muestras (caso central real)", () => {
    const conversations = [
      makeConversation("a", 0),
      makeConversation("b", 0),
      makeConversation("c", 0),
    ];
    const history = [
      makeHistoryEntry({ conversationId: "a", fromStatus: "exploring", toStatus: "interested", changedAt: at(10) }),
      makeHistoryEntry({ conversationId: "b", fromStatus: "exploring", toStatus: "interested", changedAt: at(20) }),
      makeHistoryEntry({ conversationId: "c", fromStatus: "exploring", toStatus: "interested", changedAt: at(30) }),
    ];
    const stats = buildConversionVelocityStats(history, conversations);
    expect(stats.exploringToInterested.medianHours).toBe(20);
  });

  it("mediana con número par de muestras (promedio de los dos centrales)", () => {
    const conversations = [
      makeConversation("a", 0),
      makeConversation("b", 0),
      makeConversation("c", 0),
      makeConversation("d", 0),
    ];
    const history = [
      makeHistoryEntry({ conversationId: "a", fromStatus: "exploring", toStatus: "interested", changedAt: at(10) }),
      makeHistoryEntry({ conversationId: "b", fromStatus: "exploring", toStatus: "interested", changedAt: at(20) }),
      makeHistoryEntry({ conversationId: "c", fromStatus: "exploring", toStatus: "interested", changedAt: at(30) }),
      makeHistoryEntry({ conversationId: "d", fromStatus: "exploring", toStatus: "interested", changedAt: at(40) }),
    ];
    const stats = buildConversionVelocityStats(history, conversations);
    expect(stats.exploringToInterested.medianHours).toBe(25); // (20+30)/2
  });
});

describe("buildConversionVelocityStats — muestra pequeña no representativa", () => {
  it(`menos de ${MIN_SAMPLE_SIZE_FOR_VELOCITY_STATS} casos → isRepresentative false, pero los números igual se devuelven (nunca ocultos)`, () => {
    const conversations = [makeConversation("a", 0), makeConversation("b", 0)];
    const history = [
      makeHistoryEntry({ conversationId: "a", fromStatus: "exploring", toStatus: "interested", changedAt: at(10) }),
      makeHistoryEntry({ conversationId: "b", fromStatus: "exploring", toStatus: "interested", changedAt: at(20) }),
    ];
    const stats = buildConversionVelocityStats(history, conversations);
    expect(stats.exploringToInterested.sampleSize).toBe(2);
    expect(stats.exploringToInterested.isRepresentative).toBe(false);
    expect(stats.exploringToInterested.medianHours).toBe(15); // el número existe...
  });

  it(`${MIN_SAMPLE_SIZE_FOR_VELOCITY_STATS} casos exactos → isRepresentative true`, () => {
    const conversations = Array.from({ length: MIN_SAMPLE_SIZE_FOR_VELOCITY_STATS }, (_, i) =>
      makeConversation(`c${i}`, 0)
    );
    const history = conversations.map((c) =>
      makeHistoryEntry({ conversationId: c.id, fromStatus: "exploring", toStatus: "interested", changedAt: at(10) })
    );
    const stats = buildConversionVelocityStats(history, conversations);
    expect(stats.exploringToInterested.isRepresentative).toBe(true);
  });
});

describe("buildConversionVelocityStats — conversación sin createdAt conocido", () => {
  it("una conversación no presente en el array `conversations` no aporta a exploringToInterested ni a totalTimeToConversion", () => {
    const history = [
      makeHistoryEntry({ conversationId: "orphan", fromStatus: "exploring", toStatus: "interested", changedAt: at(10) }),
      makeHistoryEntry({ conversationId: "orphan", toStatus: "client", changedAt: at(30) }),
    ];
    const stats = buildConversionVelocityStats(history, []); // conversations vacío — createdAt desconocido
    expect(stats.exploringToInterested.sampleSize).toBe(0);
    expect(stats.totalTimeToConversion.sampleSize).toBe(0);
    expect(stats.hasAnyHistoryData).toBe(true); // la tabla sí tiene filas — solo no se puede fechar este tramo
  });
});

describe("buildConversionVelocityStats — múltiples conversaciones no se mezclan entre sí", () => {
  it("las transiciones de una conversación nunca contaminan el cálculo de otra", () => {
    const conversations = [makeConversation("a", 0), makeConversation("b", 100)];
    const history = [
      makeHistoryEntry({ conversationId: "a", fromStatus: "exploring", toStatus: "interested", changedAt: at(10) }),
      makeHistoryEntry({ conversationId: "b", fromStatus: "exploring", toStatus: "interested", changedAt: at(150) }),
    ];
    const stats = buildConversionVelocityStats(history, conversations);
    expect(stats.exploringToInterested.sampleSize).toBe(2);
    expect(stats.exploringToInterested.minHours).toBe(10); // a: 10-0
    expect(stats.exploringToInterested.maxHours).toBe(50); // b: 150-100
  });
});
