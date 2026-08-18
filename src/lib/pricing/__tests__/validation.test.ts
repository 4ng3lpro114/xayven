import { describe, it, expect } from "vitest";
import { pricingCatalogItemSchema } from "../validation";

function makeValidInput(overrides: Partial<Parameters<typeof pricingCatalogItemSchema.parse>[0]> = {}) {
  return {
    slug: "start",
    name: "START",
    category: "package" as const,
    billingInterval: "ONE_TIME" as const,
    priceType: "FIXED" as const,
    basePrice: 799_000,
    currency: "COP" as const,
    isActive: true,
    features: { es: [], en: [] },
    ...overrides,
  };
}

describe("pricingCatalogItemSchema", () => {
  it("acepta un item válido", () => {
    expect(pricingCatalogItemSchema.safeParse(makeValidInput()).success).toBe(true);
  });

  it("acepta features con contenido real en ambos locales (Pre-Production Correction R1)", () => {
    const result = pricingCatalogItemSchema.safeParse(
      makeValidInput({ features: { es: ["Soporte por correo"], en: ["Email support"] } })
    );
    expect(result.success).toBe(true);
  });

  it("rechaza un ítem de features vacío (string vacío no es un bullet válido)", () => {
    const result = pricingCatalogItemSchema.safeParse(makeValidInput({ features: { es: [""], en: [] } }));
    expect(result.success).toBe(false);
  });

  it("rechaza slug con mayúsculas o espacios", () => {
    expect(pricingCatalogItemSchema.safeParse(makeValidInput({ slug: "Start Now" })).success).toBe(false);
  });

  it("rechaza category fuera de 'package'/'maintenance'", () => {
    const result = pricingCatalogItemSchema.safeParse({ ...makeValidInput(), category: "addon" });
    expect(result.success).toBe(false);
  });

  it("rechaza billingInterval fuera de 'ONE_TIME'/'MONTHLY'", () => {
    const result = pricingCatalogItemSchema.safeParse({ ...makeValidInput(), billingInterval: "YEARLY" });
    expect(result.success).toBe(false);
  });

  it("rechaza priceType fuera de 'FIXED'/'FROM'", () => {
    const result = pricingCatalogItemSchema.safeParse({ ...makeValidInput(), priceType: "APPROX" });
    expect(result.success).toBe(false);
  });

  it("rechaza basePrice <= 0", () => {
    expect(pricingCatalogItemSchema.safeParse(makeValidInput({ basePrice: 0 })).success).toBe(false);
    expect(pricingCatalogItemSchema.safeParse(makeValidInput({ basePrice: -100 })).success).toBe(false);
  });

  it("rechaza basePrice no entero (sin decimales, igual que projects.totalAmount)", () => {
    expect(pricingCatalogItemSchema.safeParse(makeValidInput({ basePrice: 799_000.5 })).success).toBe(false);
  });

  it("rechaza name vacío", () => {
    expect(pricingCatalogItemSchema.safeParse(makeValidInput({ name: "" })).success).toBe(false);
  });
});
