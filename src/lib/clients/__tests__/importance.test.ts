import { describe, it, expect } from "vitest";
import {
  classifyClientImportance,
  IMPORTANT_LEAD_SCORE_THRESHOLD,
} from "@/lib/clients/importance";

describe("classifyClientImportance", () => {
  it("cliente sin datos (sin conversaciones, sin proyectos, sin pagos) → normal", () => {
    const result = classifyClientImportance({
      leadScore: null,
      leadStatus: null,
      projects: [],
      hasPayments: false,
    });

    expect(result).toBe("normal");
  });

  it("lead_score alto (>= umbral) sin proyectos/pagos → important", () => {
    const result = classifyClientImportance({
      leadScore: IMPORTANT_LEAD_SCORE_THRESHOLD,
      leadStatus: "interested",
      projects: [],
      hasPayments: false,
    });

    expect(result).toBe("important");
  });

  it("lead_score justo debajo del umbral → normal", () => {
    const result = classifyClientImportance({
      leadScore: IMPORTANT_LEAD_SCORE_THRESHOLD - 1,
      leadStatus: "interested",
      projects: [],
      hasPayments: false,
    });

    expect(result).toBe("normal");
  });

  it("lead_status hot (aunque el score sea bajo) → important", () => {
    const result = classifyClientImportance({
      leadScore: 10,
      leadStatus: "hot",
      projects: [],
      hasPayments: false,
    });

    expect(result).toBe("important");
  });

  it("proyecto en negociación (proposal/awaiting_payment) → important", () => {
    const result = classifyClientImportance({
      leadScore: null,
      leadStatus: null,
      projects: [{ status: "proposal", paidAmount: 0 }],
      hasPayments: false,
    });

    expect(result).toBe("important");
  });

  it("cliente con al menos un pago registrado → protected", () => {
    const result = classifyClientImportance({
      leadScore: null,
      leadStatus: null,
      projects: [],
      hasPayments: true,
    });

    expect(result).toBe("protected");
  });

  it("proyecto con paid_amount > 0 (aunque hasPayments sea false) → protected", () => {
    const result = classifyClientImportance({
      leadScore: null,
      leadStatus: null,
      projects: [{ status: "awaiting_payment", paidAmount: 500000 }],
      hasPayments: false,
    });

    expect(result).toBe("protected");
  });

  it("proyecto comercialmente activo (active/in_progress/review/maintenance) → protected", () => {
    for (const status of ["active", "in_progress", "review", "maintenance"] as const) {
      const result = classifyClientImportance({
        leadScore: null,
        leadStatus: null,
        projects: [{ status, paidAmount: 0 }],
        hasPayments: false,
      });
      expect(result).toBe("protected");
    }
  });

  it("proyecto completado o cancelado, sin pagos → NO protegido solo por eso", () => {
    for (const status of ["completed", "cancelled", "lead"] as const) {
      const result = classifyClientImportance({
        leadScore: null,
        leadStatus: null,
        projects: [{ status, paidAmount: 0 }],
        hasPayments: false,
      });
      expect(result).not.toBe("protected");
    }
  });

  it("protected siempre gana sobre important, aunque también cumpla condiciones de important", () => {
    const result = classifyClientImportance({
      leadScore: 100,
      leadStatus: "hot",
      projects: [{ status: "active", paidAmount: 1000 }],
      hasPayments: true,
    });

    expect(result).toBe("protected");
  });
});
