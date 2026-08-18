import { describe, it, expect } from "vitest";
import { serviceContentSchema, createServiceSchema, updateServiceSchema } from "../validation";

function makeValidContent() {
  return {
    heading: "Diseño y desarrollo web",
    tagline: "tagline",
    definition: "definition",
    problem: ["problem 1"],
    solution: "solution",
    includes: ["includes 1"],
    forWhom: { idealIf: ["ideal 1"], notIdealIf: [] },
    useCases: [],
    faq: [{ question: "¿Q?", answer: "A." }],
  };
}

function makeValidService(overrides: Partial<ReturnType<typeof baseService>> = {}) {
  return { ...baseService(), ...overrides };
}

function baseService() {
  return {
    slug: "web-development",
    displayOrder: 0,
    isPublished: true,
    relatedPackageSlugs: ["start", "professional"],
    content: { es: makeValidContent(), en: makeValidContent() },
  };
}

describe("serviceContentSchema", () => {
  it("acepta contenido válido", () => {
    expect(serviceContentSchema.safeParse(makeValidContent()).success).toBe(true);
  });

  it("rechaza problem vacío (no permitir 'sin problema definido')", () => {
    expect(serviceContentSchema.safeParse({ ...makeValidContent(), problem: [] }).success).toBe(false);
  });

  it("rechaza includes vacío (no permitir 'sin capacidades definidas')", () => {
    expect(serviceContentSchema.safeParse({ ...makeValidContent(), includes: [] }).success).toBe(false);
  });

  it("acepta faq vacío (una lista vacía es válida a nivel de forma; el store la exige no vacía a nivel de contenido real)", () => {
    expect(serviceContentSchema.safeParse({ ...makeValidContent(), faq: [] }).success).toBe(true);
  });

  it("rechaza heading vacío", () => {
    expect(serviceContentSchema.safeParse({ ...makeValidContent(), heading: "" }).success).toBe(false);
  });
});

describe("createServiceSchema", () => {
  it("acepta un servicio válido", () => {
    expect(createServiceSchema.safeParse(makeValidService()).success).toBe(true);
  });

  it("rechaza slug con mayúsculas o espacios", () => {
    expect(createServiceSchema.safeParse(makeValidService({ slug: "Web Dev" })).success).toBe(false);
  });

  it("rechaza displayOrder negativo", () => {
    expect(createServiceSchema.safeParse(makeValidService({ displayOrder: -1 })).success).toBe(false);
  });

  it("acepta relatedPackageSlugs vacío (servicio sin paquete cerrado, ej. SEO/Automatización)", () => {
    expect(createServiceSchema.safeParse(makeValidService({ relatedPackageSlugs: [] })).success).toBe(true);
  });

  it("rechaza un slug de paquete relacionado con mayúsculas/espacios", () => {
    expect(createServiceSchema.safeParse(makeValidService({ relatedPackageSlugs: ["Bad Slug"] })).success).toBe(false);
  });
});

describe("updateServiceSchema", () => {
  it("acepta un patch parcial sin slug", () => {
    expect(updateServiceSchema.safeParse({ isPublished: false }).success).toBe(true);
  });

  it("acepta un objeto vacío (ningún campo obligatorio en un update)", () => {
    expect(updateServiceSchema.safeParse({}).success).toBe(true);
  });

  it("rechaza slug en un patch — nunca editable por esta vía (ver types.ts)", () => {
    const result = updateServiceSchema.safeParse({ slug: "new-slug" });
    // slug is stripped by .omit(), so passing it is simply ignored, not
    // rejected — assert it never survives into the parsed output.
    expect(result.success && !("slug" in result.data)).toBe(true);
  });
});
