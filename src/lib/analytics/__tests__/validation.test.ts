import { describe, it, expect } from "vitest";
import { trackEventSchema } from "../validation";

function makeValidInput(overrides: Record<string, unknown> = {}) {
  return {
    eventType: "service_page_view",
    serviceSlug: "seo",
    ...overrides,
  };
}

describe("trackEventSchema", () => {
  it("acepta un evento válido con serviceSlug", () => {
    expect(trackEventSchema.safeParse(makeValidInput()).success).toBe(true);
  });

  it("acepta un evento sin ningún slug (ej. maintenance_cta genérico)", () => {
    expect(trackEventSchema.safeParse({ eventType: "maintenance_cta" }).success).toBe(true);
  });

  it("rechaza un eventType fuera de los 7 autorizados", () => {
    expect(trackEventSchema.safeParse(makeValidInput({ eventType: "custom_event" })).success).toBe(false);
  });

  it("rechaza un serviceSlug con mayúsculas o espacios", () => {
    expect(trackEventSchema.safeParse(makeValidInput({ serviceSlug: "Not Valid" })).success).toBe(false);
  });

  it("rechaza un locale fuera de es/en", () => {
    expect(trackEventSchema.safeParse(makeValidInput({ locale: "fr" })).success).toBe(false);
  });

  it("ignora metadata si se envía — el schema no la declara, nunca llega al store", () => {
    const result = trackEventSchema.safeParse(makeValidInput({ metadata: { evil: "<script>" } }));
    expect(result.success && !("metadata" in result.data)).toBe(true);
  });
});
