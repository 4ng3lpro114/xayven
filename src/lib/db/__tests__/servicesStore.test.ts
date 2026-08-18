import { describe, it, expect } from "vitest";
import {
  listServices,
  getServiceBySlug,
  getServiceById,
  createService,
  updateService,
  setServicePublished,
  ServiceNotFoundError,
  ServiceSlugConflictError,
} from "@/lib/db/servicesStore";
import type { CreateServiceInput, ServiceContent } from "@/lib/services/types";

// No SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the test environment, so
// servicesStore.ts transparently uses its in-memory fallback — same
// pattern as pricingCatalogStore.test.ts. Pre-seeded with the 5 real
// services (see SEED_SERVICES in servicesStore.ts).

const EXPECTED_SLUGS = ["automation", "custom-solutions", "ecommerce", "seo", "web-development"].sort();

function minimalContent(heading: string): ServiceContent {
  return {
    heading,
    tagline: "tagline",
    definition: "definition",
    problem: ["problem 1"],
    solution: "solution",
    includes: ["includes 1"],
    forWhom: { idealIf: ["ideal 1"], notIdealIf: [] },
    useCases: [],
    faq: [],
  };
}

describe("servicesStore — catálogo inicial de servicios (Services Phase 1)", () => {
  it("lista exactamente 5 servicios, ni uno más", async () => {
    const services = await listServices();
    expect(services).toHaveLength(5);
  });

  it("los 5 slugs exigidos existen, y solo esos", async () => {
    const services = await listServices();
    expect(services.map((s) => s.slug).sort()).toEqual(EXPECTED_SLUGS);
  });

  it("displayOrder define un orden deliberado, no alfabético", async () => {
    const services = await listServices();
    expect(services.map((s) => s.slug)).toEqual([
      "web-development",
      "ecommerce",
      "seo",
      "automation",
      "custom-solutions",
    ]);
  });

  it("todos publicados por defecto (isPublished=true, ninguno oculto todavía)", async () => {
    const services = await listServices();
    expect(services.every((s) => s.isPublished)).toBe(true);
  });

  it.each([
    ["web-development", ["start", "professional", "business"]],
    ["ecommerce", ["ecommerce"]],
    ["seo", []],
    ["automation", []],
    ["custom-solutions", ["custom"]],
  ] as const)(
    "slug '%s' → relatedPackageSlugs=%j (mapeo servicio↔paquete exacto del prompt maestro §11)",
    async (slug, relatedPackageSlugs) => {
      const service = await getServiceBySlug(slug);
      expect(service).not.toBeNull();
      expect(service?.relatedPackageSlugs).toEqual(relatedPackageSlugs);
    }
  );

  it("cada servicio tiene contenido completo en es y en, con al menos 1 FAQ", async () => {
    const services = await listServices();
    for (const service of services) {
      for (const locale of ["es", "en"] as const) {
        const content = service.content[locale];
        expect(content.heading.length).toBeGreaterThan(0);
        expect(content.tagline.length).toBeGreaterThan(0);
        expect(content.definition.length).toBeGreaterThan(0);
        expect(content.problem.length).toBeGreaterThan(0);
        expect(content.solution.length).toBeGreaterThan(0);
        expect(content.includes.length).toBeGreaterThan(0);
        expect(content.forWhom.idealIf.length).toBeGreaterThan(0);
        expect(content.faq.length).toBeGreaterThan(0);
      }
    }
  });

  it("ningún servicio tiene menos de 6 preguntas FAQ (evita relleno vacío, exige contenido real)", async () => {
    const services = await listServices();
    for (const service of services) {
      for (const locale of ["es", "en"] as const) {
        expect(service.content[locale].faq.length).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it("slug inexistente → null, nunca lanza", async () => {
    expect(await getServiceBySlug("no-existe")).toBeNull();
  });

  it("id inexistente → null, nunca lanza", async () => {
    expect(await getServiceById("no-existe")).toBeNull();
  });

  it("getServiceById encuentra lo que listServices ya devolvió", async () => {
    const services = await listServices();
    const first = services[0]!;
    const found = await getServiceById(first.id);
    expect(found).toEqual(first);
  });

  it("filtro publishedOnly=true → los 5 (todos publicados por defecto)", async () => {
    const services = await listServices({ publishedOnly: true });
    expect(services).toHaveLength(5);
  });

  it("nombre de mantenimiento nunca aparece como paquete relacionado de ningún servicio (maintenance está fuera del alcance de Services)", async () => {
    const services = await listServices();
    const maintenanceSlugs = ["essential", "growth", "care-plus"];
    for (const service of services) {
      for (const pkg of service.relatedPackageSlugs) {
        expect(maintenanceSlugs).not.toContain(pkg);
      }
    }
  });

  describe("writes (Admin CRUD, ready for Phase 5)", () => {
    function draftInput(slug: string, overrides: Partial<CreateServiceInput> = {}): CreateServiceInput {
      return {
        slug,
        displayOrder: 99,
        isPublished: false,
        relatedPackageSlugs: [],
        content: { es: minimalContent("Prueba"), en: minimalContent("Test") },
        ...overrides,
      };
    }

    it("createService agrega un servicio nuevo, recuperable por slug", async () => {
      const created = await createService(draftInput("test-service-create"));
      expect(created.slug).toBe("test-service-create");
      const found = await getServiceBySlug("test-service-create");
      expect(found).toEqual(created);
    });

    it("createService con slug duplicado lanza ServiceSlugConflictError, nunca sobrescribe silenciosamente", async () => {
      await createService(draftInput("test-service-dup"));
      await expect(createService(draftInput("test-service-dup"))).rejects.toThrow(ServiceSlugConflictError);
    });

    it("updateService modifica solo los campos provistos (whitelist explícito, nunca un spread crudo)", async () => {
      const created = await createService(draftInput("test-service-update"));
      const updated = await updateService(created.id, { isPublished: true });
      expect(updated.isPublished).toBe(true);
      expect(updated.slug).toBe(created.slug); // slug never touched by a generic update
      expect(updated.displayOrder).toBe(created.displayOrder); // untouched field preserved
    });

    it("updateService sobre un id inexistente lanza ServiceNotFoundError", async () => {
      await expect(updateService("no-existe", { isPublished: true })).rejects.toThrow(ServiceNotFoundError);
    });

    it("setServicePublished cambia isPublished sin tocar el resto del contenido", async () => {
      const created = await createService(draftInput("test-service-publish"));
      const published = await setServicePublished(created.id, true);
      expect(published.isPublished).toBe(true);
      expect(published.content).toEqual(created.content);

      const unpublished = await setServicePublished(created.id, false);
      expect(unpublished.isPublished).toBe(false);
    });

    it("un servicio despublicado deja de aparecer en publishedOnly=true pero sigue existiendo por id", async () => {
      const created = await createService(draftInput("test-service-hide", { isPublished: true }));
      await setServicePublished(created.id, false);

      const publishedList = await listServices({ publishedOnly: true });
      expect(publishedList.some((s) => s.id === created.id)).toBe(false);

      const stillExists = await getServiceById(created.id);
      expect(stillExists).not.toBeNull();
    });
  });
});
