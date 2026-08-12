import { describe, it, expect } from "vitest";
import {
  classifyProjectImportance,
  getProjectProtectionReason,
  getProjectProtection,
} from "@/lib/projects/protection";
import type { ProjectStatus } from "@/lib/payments/types";

describe("getProjectProtectionReason", () => {
  it("sin pagos, sin paidAmount, status lead/cancelled → null (no protegido)", () => {
    for (const status of ["lead", "cancelled"] as ProjectStatus[]) {
      const reason = getProjectProtectionReason({ status, paidAmount: 0, payments: [] });
      expect(reason).toBeNull();
    }
  });

  it("un solo pago APPROVED → has_payments", () => {
    const reason = getProjectProtectionReason({
      status: "awaiting_payment",
      paidAmount: 0,
      payments: [{ status: "APPROVED" }],
    });
    expect(reason).toBe("has_payments");
  });

  it("paidAmount > 0 aunque no haya fila en payments → has_payments igual", () => {
    const reason = getProjectProtectionReason({
      status: "awaiting_payment",
      paidAmount: 500,
      payments: [],
    });
    expect(reason).toBe("has_payments");
  });

  it("pagos existen pero NINGUNO aprobado (PENDING/DECLINED/ERROR) → has_payment_attempts", () => {
    for (const status of ["PENDING", "DECLINED", "ERROR"] as const) {
      const reason = getProjectProtectionReason({
        status: "awaiting_payment",
        paidAmount: 0,
        payments: [{ status }],
      });
      expect(reason).toBe("has_payment_attempts");
    }
  });

  it("has_payments gana sobre has_payment_attempts cuando ambas condiciones aplican", () => {
    const reason = getProjectProtectionReason({
      status: "awaiting_payment",
      paidAmount: 0,
      payments: [{ status: "DECLINED" }, { status: "APPROVED" }],
    });
    expect(reason).toBe("has_payments");
  });

  it("sin pagos, sin paidAmount, status de trabajo activo → active_work", () => {
    for (const status of ["active", "in_progress", "review", "maintenance", "completed"] as ProjectStatus[]) {
      const reason = getProjectProtectionReason({ status, paidAmount: 0, payments: [] });
      expect(reason).toBe("active_work");
    }
  });

  it("has_payments gana sobre active_work cuando ambas condiciones aplican", () => {
    const reason = getProjectProtectionReason({
      status: "active",
      paidAmount: 1000,
      payments: [],
    });
    expect(reason).toBe("has_payments");
  });

  it("has_payment_attempts gana sobre active_work cuando ambas condiciones aplican", () => {
    const reason = getProjectProtectionReason({
      status: "completed",
      paidAmount: 0,
      payments: [{ status: "PENDING" }],
    });
    expect(reason).toBe("has_payment_attempts");
  });

  it("proposal/awaiting_payment sin pagos → null (no protegido, es 'important')", () => {
    for (const status of ["proposal", "awaiting_payment"] as ProjectStatus[]) {
      const reason = getProjectProtectionReason({ status, paidAmount: 0, payments: [] });
      expect(reason).toBeNull();
    }
  });
});

describe("classifyProjectImportance", () => {
  it("lead/cancelled sin pagos → normal", () => {
    for (const status of ["lead", "cancelled"] as ProjectStatus[]) {
      expect(classifyProjectImportance({ status, paidAmount: 0, payments: [] })).toBe("normal");
    }
  });

  it("proposal/awaiting_payment sin pagos → important", () => {
    for (const status of ["proposal", "awaiting_payment"] as ProjectStatus[]) {
      expect(classifyProjectImportance({ status, paidAmount: 0, payments: [] })).toBe("important");
    }
  });

  it("cualquier pago (aprobado o no) → protected, nunca 'important' ni 'normal'", () => {
    expect(
      classifyProjectImportance({ status: "awaiting_payment", paidAmount: 0, payments: [{ status: "PENDING" }] })
    ).toBe("protected");
    expect(
      classifyProjectImportance({ status: "proposal", paidAmount: 0, payments: [{ status: "APPROVED" }] })
    ).toBe("protected");
  });

  it("estados de trabajo activo → protected, incluso sin pagos", () => {
    for (const status of ["active", "in_progress", "review", "maintenance", "completed"] as ProjectStatus[]) {
      expect(classifyProjectImportance({ status, paidAmount: 0, payments: [] })).toBe("protected");
    }
  });

  it("cubre los 9 valores reales de ProjectStatus, ninguno queda sin clasificar", () => {
    const allStatuses: ProjectStatus[] = [
      "lead",
      "proposal",
      "awaiting_payment",
      "active",
      "in_progress",
      "review",
      "completed",
      "maintenance",
      "cancelled",
    ];
    for (const status of allStatuses) {
      const result = classifyProjectImportance({ status, paidAmount: 0, payments: [] });
      expect(["normal", "important", "protected"]).toContain(result);
    }
  });

  it("exhaustividad: reason !== null si y solo si importance === 'protected'", () => {
    const cases: { status: ProjectStatus; paidAmount: number; payments: { status: "APPROVED" | "PENDING" }[] }[] = [
      { status: "lead", paidAmount: 0, payments: [] },
      { status: "proposal", paidAmount: 0, payments: [] },
      { status: "awaiting_payment", paidAmount: 0, payments: [{ status: "PENDING" }] },
      { status: "active", paidAmount: 1000, payments: [] },
      { status: "completed", paidAmount: 0, payments: [] },
    ];
    for (const input of cases) {
      const reason = getProjectProtectionReason(input);
      const importance = classifyProjectImportance(input);
      expect(reason !== null).toBe(importance === "protected");
    }
  });
});

describe("getProjectProtection", () => {
  it("combina importance + reason a partir de un Project real", () => {
    const result = getProjectProtection(
      { status: "awaiting_payment", paidAmount: 0 },
      [{ status: "APPROVED" }]
    );
    expect(result).toEqual({ importance: "protected", reason: "has_payments" });
  });

  it("proyecto sin protección → reason null", () => {
    const result = getProjectProtection({ status: "lead", paidAmount: 0 }, []);
    expect(result).toEqual({ importance: "normal", reason: null });
  });
});
