import { describe, it, expect } from "vitest";
import { resolveMaintenancePlanPrice } from "../maintenancePlanPrice";
import { listPricingCatalogItems } from "@/lib/db/pricingCatalogStore";

const labels = { perMonthSuffix: "/mes", priceUnavailable: "Consultar" };

describe("resolveMaintenancePlanPrice (Maintenance Phase 4 / Pre-Production Correction R1)", () => {
  it.each([
    ["essential", "Essential", "149.000 COP/mes"],
    ["growth", "Growth", "299.000 COP/mes"],
    ["care-plus", "Care+", "499.000 COP/mes"],
  ] as const)("slug '%s' → displayName=%s, priceLabel=%s (contra el catálogo real, nunca hardcodeado)", async (slug, displayName, priceLabel) => {
    const catalogItems = await listPricingCatalogItems();
    const result = resolveMaintenancePlanPrice(slug, catalogItems, "es", labels);
    expect(result.displayName).toBe(displayName);
    expect(result.priceLabel).toBe(priceLabel);
  });

  it.each([
    ["essential", "es", "Actualizaciones técnicas y de seguridad"],
    ["essential", "en", "Technical and security updates"],
    ["growth", "es", "Todo lo de Essential"],
    ["growth", "en", "Everything in Essential"],
    ["care-plus", "es", "Todo lo de Growth"],
    ["care-plus", "en", "Everything in Growth"],
  ] as const)(
    "slug '%s', locale '%s' → features reales de Pricing Core (fuente única, R1) incluyen '%s'",
    async (slug, locale, expectedFirstFeature) => {
      const catalogItems = await listPricingCatalogItems();
      const result = resolveMaintenancePlanPrice(slug, catalogItems, locale, labels);
      expect(result.features).toContain(expectedFirstFeature);
      expect(result.features.length).toBeGreaterThan(0);
    }
  );

  it("slug inexistente → displayName null, priceLabel = fallback, features vacío (nunca un precio ni features inventados)", async () => {
    const catalogItems = await listPricingCatalogItems();
    const result = resolveMaintenancePlanPrice("no-existe", catalogItems, "es", labels);
    expect(result).toEqual({ displayName: null, priceLabel: "Consultar", features: [] });
  });

  it("item inactivo → tratado igual que inexistente (fallback, nunca muestra un plan desactivado como disponible)", async () => {
    const catalogItems = await listPricingCatalogItems();
    const inactiveEssential = catalogItems.map((item) =>
      item.slug === "essential" ? { ...item, isActive: false } : item
    );
    const result = resolveMaintenancePlanPrice("essential", inactiveEssential, "es", labels);
    expect(result).toEqual({ displayName: null, priceLabel: "Consultar", features: [] });
  });

  it("un paquete de tipo 'package' (no 'maintenance') también resuelve por slug — la función no filtra por category, el caller ya lo hace; features vacío por diseño", async () => {
    const catalogItems = await listPricingCatalogItems();
    const result = resolveMaintenancePlanPrice("start", catalogItems, "es", labels);
    expect(result.displayName).toBe("START");
    expect(result.features).toEqual([]);
  });
});
