import { describe, it, expect } from "vitest";
import {
  classifyClientImportance,
  getClientProtectionReason,
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

  /**
   * Fase 5C-fix (auditoría de eliminación de proyectos): antes de este
   * fix, un proyecto en negociación (proposal/awaiting_payment) sin pagos
   * clasificaba como "important", NO "protected" — dejaba pasar el
   * cliente hasta un DELETE real que Postgres terminaba rechazando por la
   * FK `projects.client_id -> clients.id` (ON DELETE RESTRICT), causando
   * el 500 genérico reportado en producción con Angel Rojas/PRUEBA
   * XAYVEN. Esta es la prueba central del fix.
   */
  it("cliente con CUALQUIER proyecto asociado, sin importar su status ni si tiene pagos → SIEMPRE protected", () => {
    const allStatuses = [
      "lead",
      "proposal",
      "awaiting_payment",
      "active",
      "in_progress",
      "review",
      "completed",
      "maintenance",
      "cancelled",
    ] as const;

    for (const status of allStatuses) {
      const result = classifyClientImportance({
        leadScore: null,
        leadStatus: null,
        projects: [{ status, paidAmount: 0 }],
        hasPayments: false,
      });
      expect(result).toBe("protected");
    }
  });

  it("cliente con un proyecto, aunque tenga lead_score alto y esté 'hot' → protected gana igual (nunca 'important')", () => {
    const result = classifyClientImportance({
      leadScore: 100,
      leadStatus: "hot",
      projects: [{ status: "awaiting_payment", paidAmount: 0 }],
      hasPayments: false,
    });

    expect(result).toBe("protected");
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

/**
 * Fase 5C-fix-2 (revisión puntual, ago-2026): getClientProtectionReason()
 * es ahora la ÚNICA fuente de verdad tanto para classifyClientImportance()
 * como para el endpoint DELETE /api/admin/clients/[id] y la página de
 * detalle — antes, el endpoint y la página recalculaban esta misma
 * decisión en paralelo (`hasPayments || hasPaidProject`), lo que podía
 * divergir de esta función si algún día cambiara sin tocar los otros dos
 * sitios. Estas pruebas verifican tanto la precedencia (pagos gana) como
 * que el resultado sea exhaustivo respecto a classifyClientImportance:
 * `null` aquí siempre implica "not protected" allá, y viceversa.
 */
describe("getClientProtectionReason", () => {
  it("sin pagos y sin proyectos → null (no protegido)", () => {
    const reason = getClientProtectionReason({
      leadScore: null,
      leadStatus: null,
      projects: [],
      hasPayments: false,
    });

    expect(reason).toBeNull();
  });

  it("con fila real en `payments` (hasPayments), sin proyectos con paidAmount>0 → has_payments", () => {
    const reason = getClientProtectionReason({
      leadScore: null,
      leadStatus: null,
      projects: [{ status: "awaiting_payment", paidAmount: 0 }],
      hasPayments: true,
    });

    expect(reason).toBe("has_payments");
  });

  it("sin fila en `payments`, pero un proyecto con paidAmount>0 → has_payments igual", () => {
    const reason = getClientProtectionReason({
      leadScore: null,
      leadStatus: null,
      projects: [{ status: "active", paidAmount: 500000 }],
      hasPayments: false,
    });

    expect(reason).toBe("has_payments");
  });

  it("proyecto sin pagos (ni hasPayments ni paidAmount>0) → has_related_projects", () => {
    const reason = getClientProtectionReason({
      leadScore: null,
      leadStatus: null,
      projects: [{ status: "awaiting_payment", paidAmount: 0 }],
      hasPayments: false,
    });

    expect(reason).toBe("has_related_projects");
  });

  it("pagos Y proyectos simultáneamente → has_payments gana siempre", () => {
    const reason = getClientProtectionReason({
      leadScore: null,
      leadStatus: null,
      projects: [{ status: "active", paidAmount: 1000 }],
      hasPayments: true,
    });

    expect(reason).toBe("has_payments");
  });

  it("exhaustividad: reason !== null si y solo si classifyClientImportance === 'protected', para el mismo input", () => {
    const cases: Parameters<typeof getClientProtectionReason>[0][] = [
      { leadScore: null, leadStatus: null, projects: [], hasPayments: false },
      { leadScore: 100, leadStatus: "hot", projects: [], hasPayments: false },
      { leadScore: null, leadStatus: null, projects: [], hasPayments: true },
      { leadScore: null, leadStatus: null, projects: [{ status: "lead", paidAmount: 0 }], hasPayments: false },
      {
        leadScore: null,
        leadStatus: null,
        projects: [{ status: "active", paidAmount: 1000 }],
        hasPayments: true,
      },
    ];

    for (const input of cases) {
      const reason = getClientProtectionReason(input);
      const importance = classifyClientImportance(input);
      expect(reason !== null).toBe(importance === "protected");
    }
  });
});
