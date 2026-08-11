import { describe, it, expect } from "vitest";
import { generatePaymentReference } from "@/lib/payments/reference";

describe("generatePaymentReference", () => {
  it("embeds a shortened form of the project id and the XAYVEN prefix", () => {
    const ref = generatePaymentReference("11111111-2222-3333-4444-555555555555");
    expect(ref.startsWith("XAYVEN-")).toBe(true);
    expect(ref).toContain("11111111");
  });

  it("never reuses a reference across two calls, even for the same project", () => {
    const projectId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const refs = new Set(Array.from({ length: 500 }, () => generatePaymentReference(projectId)));
    expect(refs.size).toBe(500);
  });

  it("only produces uppercase alphanumerics and hyphens", () => {
    const ref = generatePaymentReference("11111111-2222-3333-4444-555555555555");
    expect(ref).toMatch(/^[A-Z0-9-]+$/);
  });
});
