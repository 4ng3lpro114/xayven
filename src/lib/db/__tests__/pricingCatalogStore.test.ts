import { describe, it, expect } from "vitest";
import {
  listPricingCatalogItems,
  getPricingCatalogItemBySlug,
  getPricingCatalogItemById,
  createPricingCatalogItem,
  updatePricingCatalogItem,
  setPricingCatalogItemActive,
  PricingCatalogItemNotFoundError,
  PricingCatalogSlugConflictError,
} from "@/lib/db/pricingCatalogStore";
import type { PricingCatalogItemInput } from "@/lib/pricing/validation";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// pricingCatalogStore.ts transparently uses its in-memory fallback — same
// pattern as paymentsStore.clientRelations.test.ts. Unlike other stores'
// memory fallback, this one is pre-seeded (see ensureMemorySeeded()) with
// the exact same 8 items the real migration inserts.

describe("pricingCatalogStore — catálogo inicial (Pricing Core, Fase 1)", () => {
  it("lista exactamente 8 items, ni uno más", async () => {
    const items = await listPricingCatalogItems();
    expect(items).toHaveLength(8);
  });

  it("los 8 slugs exigidos existen, y solo esos", async () => {
    const items = await listPricingCatalogItems();
    const slugs = items.map((i) => i.slug).sort();
    expect(slugs).toEqual(
      ["business", "care-plus", "custom", "ecommerce", "essential", "growth", "professional", "start"].sort()
    );
  });

  it.each([
    ["start", "START", "package", "ONE_TIME", "FIXED", 799_000],
    ["professional", "PROFESSIONAL", "package", "ONE_TIME", "FIXED", 1_499_000],
    ["business", "BUSINESS", "package", "ONE_TIME", "FIXED", 2_499_000],
    ["ecommerce", "E-COMMERCE", "package", "ONE_TIME", "FROM", 3_499_000],
    ["custom", "CUSTOM", "package", "ONE_TIME", "FROM", 6_000_000],
    ["essential", "Essential", "maintenance", "MONTHLY", "FIXED", 149_000],
    ["growth", "Growth", "maintenance", "MONTHLY", "FIXED", 299_000],
    ["care-plus", "Care+", "maintenance", "MONTHLY", "FIXED", 499_000],
  ] as const)(
    "slug '%s' → name=%s, category=%s, billingInterval=%s, priceType=%s, basePrice=%i (valores exactos exigidos)",
    async (slug, name, category, billingInterval, priceType, basePrice) => {
      const item = await getPricingCatalogItemBySlug(slug);
      expect(item).not.toBeNull();
      expect(item).toMatchObject({ slug, name, category, billingInterval, priceType, basePrice, currency: "COP", isActive: true });
    }
  );

  it("nombres de mantenimiento preservados EXACTAMENTE — 'Essential'/'Growth'/'Care+', no variantes", async () => {
    const essential = await getPricingCatalogItemBySlug("essential");
    const growth = await getPricingCatalogItemBySlug("growth");
    const carePlus = await getPricingCatalogItemBySlug("care-plus");
    expect(essential?.name).toBe("Essential");
    expect(growth?.name).toBe("Growth");
    expect(carePlus?.name).toBe("Care+");
  });

  it("slug inexistente → null, nunca lanza", async () => {
    expect(await getPricingCatalogItemBySlug("no-existe")).toBeNull();
  });

  it("id inexistente → null, nunca lanza", async () => {
    expect(await getPricingCatalogItemById("no-existe")).toBeNull();
  });

  it("getPricingCatalogItemById encuentra lo que listPricingCatalogItems ya devolvió", async () => {
    const items = await listPricingCatalogItems();
    const first = items[0]!;
    const found = await getPricingCatalogItemById(first.id);
    expect(found).toEqual(first);
  });

  it("filtro por category='package' → exactamente los 5 paquetes web", async () => {
    const items = await listPricingCatalogItems({ category: "package" });
    expect(items).toHaveLength(5);
    expect(items.every((i) => i.category === "package")).toBe(true);
  });

  it("filtro por category='maintenance' → exactamente los 3 planes de mantenimiento", async () => {
    const items = await listPricingCatalogItems({ category: "maintenance" });
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.name).sort()).toEqual(["Care+", "Essential", "Growth"]);
  });

  it("filtro activeOnly=true → los 8 (todos activos por defecto, ninguno desactivado todavía)", async () => {
    const items = await listPricingCatalogItems({ activeOnly: true });
    expect(items).toHaveLength(8);
  });

  it("todo item tiene currency='COP' — ningún precio en otra moneda todavía", async () => {
    const items = await listPricingCatalogItems();
    expect(items.every((i) => i.currency === "COP")).toBe(true);
  });

  it("Pre-Production Correction R1 — los 3 planes de mantenimiento tienen features reales en ES y EN directamente en el store", async () => {
    const essential = await getPricingCatalogItemBySlug("essential");
    expect(essential?.features.es).toContain("Actualizaciones técnicas y de seguridad");
    expect(essential?.features.en).toContain("Technical and security updates");

    const growth = await getPricingCatalogItemBySlug("growth");
    expect(growth?.features.es.length).toBeGreaterThan(0);
    expect(growth?.features.en.length).toBeGreaterThan(0);

    const carePlus = await getPricingCatalogItemBySlug("care-plus");
    expect(carePlus?.features.es.length).toBeGreaterThan(0);
    expect(carePlus?.features.en.length).toBeGreaterThan(0);
  });

  it("R1 — los 5 paquetes web tienen features vacío (su 'qué incluye' vive en Service.content.includes, no aquí)", async () => {
    const items = await listPricingCatalogItems({ category: "package" });
    for (const item of items) {
      expect(item.features.es).toEqual([]);
      expect(item.features.en).toEqual([]);
    }
  });

  it("no se inventó ningún producto adicional fuera de los 8 autorizados", async () => {
    const items = await listPricingCatalogItems();
    const names = items.map((i) => i.name).sort();
    expect(names).toEqual(
      ["BUSINESS", "CUSTOM", "Care+", "E-COMMERCE", "Essential", "Growth", "PROFESSIONAL", "START"].sort()
    );
  });

  describe("writes (Admin Phase 5)", () => {
    function draftInput(slug: string, overrides: Partial<PricingCatalogItemInput> = {}): PricingCatalogItemInput {
      return {
        slug,
        name: "Producto de prueba",
        category: "package",
        billingInterval: "ONE_TIME",
        priceType: "FIXED",
        basePrice: 100_000,
        currency: "COP",
        isActive: true,
        features: { es: [], en: [] },
        ...overrides,
      };
    }

    it("createPricingCatalogItem agrega un item nuevo, recuperable por slug", async () => {
      const created = await createPricingCatalogItem(draftInput("test-item-create"));
      expect(created.slug).toBe("test-item-create");
      const found = await getPricingCatalogItemBySlug("test-item-create");
      expect(found).toEqual(created);
    });

    it("createPricingCatalogItem con slug duplicado (incluso uno de los 8 seed) lanza PricingCatalogSlugConflictError", async () => {
      await expect(createPricingCatalogItem(draftInput("start"))).rejects.toThrow(PricingCatalogSlugConflictError);
    });

    it("updatePricingCatalogItem modifica solo los campos provistos (whitelist explícito, nunca un spread crudo)", async () => {
      const created = await createPricingCatalogItem(draftInput("test-item-update"));
      const updated = await updatePricingCatalogItem(created.id, { basePrice: 250_000 });
      expect(updated.basePrice).toBe(250_000);
      expect(updated.slug).toBe(created.slug); // slug never touched by a generic update
      expect(updated.category).toBe(created.category); // category never touched either
      expect(updated.name).toBe(created.name); // untouched field preserved
    });

    it("updatePricingCatalogItem sobre un id inexistente lanza PricingCatalogItemNotFoundError", async () => {
      await expect(updatePricingCatalogItem("no-existe", { basePrice: 1 })).rejects.toThrow(
        PricingCatalogItemNotFoundError
      );
    });

    it("setPricingCatalogItemActive cambia isActive sin tocar el resto de los campos", async () => {
      const created = await createPricingCatalogItem(draftInput("test-item-active", { isActive: true }));
      const deactivated = await setPricingCatalogItemActive(created.id, false);
      expect(deactivated.isActive).toBe(false);
      expect(deactivated.basePrice).toBe(created.basePrice);

      const reactivated = await setPricingCatalogItemActive(created.id, true);
      expect(reactivated.isActive).toBe(true);
    });

    it("un item desactivado deja de aparecer con activeOnly=true pero sigue existiendo por id", async () => {
      const created = await createPricingCatalogItem(draftInput("test-item-hide", { isActive: true }));
      await setPricingCatalogItemActive(created.id, false);

      const activeList = await listPricingCatalogItems({ activeOnly: true });
      expect(activeList.some((i) => i.id === created.id)).toBe(false);

      const stillExists = await getPricingCatalogItemById(created.id);
      expect(stillExists).not.toBeNull();
    });
  });
});
