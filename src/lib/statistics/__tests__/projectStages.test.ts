import { describe, it, expect } from "vitest";
import { classifyProjectWorkStage } from "@/lib/statistics/projectStages";
import type { ProjectStatus } from "@/lib/payments/types";

describe("classifyProjectWorkStage", () => {
  it("lead, proposal, awaiting_payment → pending", () => {
    for (const status of ["lead", "proposal", "awaiting_payment"] as ProjectStatus[]) {
      expect(classifyProjectWorkStage(status)).toBe("pending");
    }
  });

  it("active, in_progress, review, maintenance → in_progress", () => {
    for (const status of ["active", "in_progress", "review", "maintenance"] as ProjectStatus[]) {
      expect(classifyProjectWorkStage(status)).toBe("in_progress");
    }
  });

  it("completed → completed", () => {
    expect(classifyProjectWorkStage("completed")).toBe("completed");
  });

  it("cancelled → cancelled (bucket propio, no se mezcla con pending ni completed)", () => {
    expect(classifyProjectWorkStage("cancelled")).toBe("cancelled");
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
      expect(["completed", "in_progress", "pending", "cancelled"]).toContain(
        classifyProjectWorkStage(status)
      );
    }
  });
});
