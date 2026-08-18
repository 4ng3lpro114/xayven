import { describe, it, expect } from "vitest";
import { buildSystemPrompt, type CommercialKnowledge } from "../knowledge";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { listServices } from "@/lib/db/servicesStore";
import { listPricingCatalogItems } from "@/lib/db/pricingCatalogStore";
import type { PublicPromotion } from "@/lib/promotions/types";

function makePublicPromotion(overrides: Partial<PublicPromotion> = {}): PublicPromotion {
  return {
    id: "promo-1",
    text: "🔥 ¡20% de descuento durante agosto!",
    discountType: "percentage",
    discountValue: 20,
    currency: null,
    startAt: "2026-08-01T00:00:00.000Z",
    endAt: "2026-08-31T23:59:59.000Z",
    ctaLabel: "Quiero aprovecharla",
    ctaMessage: null,
    ...overrides,
  };
}

describe("buildSystemPrompt — contexto de promoción (Fase 11 Etapa A)", () => {
  it("sin promoción activa (el caso común, sin cambios) → nunca incluye el bloque ACTIVE PROMOTION", async () => {
    const dict = await getDictionary("es");
    const prompt = buildSystemPrompt(dict, "es");

    expect(prompt).not.toContain("ACTIVE PROMOTION");
  });

  it("activePromotion=null explícito → mismo resultado que omitirlo", async () => {
    const dict = await getDictionary("es");
    const prompt = buildSystemPrompt(dict, "es", null);

    expect(prompt).not.toContain("ACTIVE PROMOTION");
  });

  it("con promoción activa → incluye el copy real, el beneficio formateado y la fecha de vigencia", async () => {
    const dict = await getDictionary("es");
    const promotion = makePublicPromotion();

    const prompt = buildSystemPrompt(dict, "es", promotion);

    expect(prompt).toContain("ACTIVE PROMOTION");
    expect(prompt).toContain("🔥 ¡20% de descuento durante agosto!");
    expect(prompt).toContain("20%"); // formatPromotionDiscount() reused, no lógica de formato duplicada
  });

  it("descuento de monto fijo → reutiliza formatPromotionDiscount(), nunca reconstruye el formato aquí", async () => {
    const dict = await getDictionary("es");
    const promotion = makePublicPromotion({
      discountType: "fixed_amount",
      discountValue: 100000,
      currency: "COP",
    });

    const prompt = buildSystemPrompt(dict, "es", promotion);

    expect(prompt).toMatch(/-\$?100[.,]?000/); // mismo formatMoney() que el admin, no un formato ad hoc
  });

  it("instruye explícitamente a no inventar otros descuentos ni prometer más de lo indicado", async () => {
    const dict = await getDictionary("es");
    const prompt = buildSystemPrompt(dict, "es", makePublicPromotion());

    expect(prompt).toMatch(/never invent a different discount/i);
  });

  it("J. nunca expone campos administrativos — PublicPromotion no tiene name/audience/metadata, así que no pueden aparecer", async () => {
    const dict = await getDictionary("es");
    const promotion = makePublicPromotion();
    const prompt = buildSystemPrompt(dict, "es", promotion);

    // PublicPromotion (types.ts) estructuralmente no tiene estos campos —
    // esta prueba documenta esa garantía en el prompt final, no solo en el
    // tipo.
    expect(prompt).not.toMatch(/"name"|"audience"|"metadata"|"audienceRules"/);
  });
});

describe("buildSystemPrompt — commercial knowledge (Services Phase 6)", () => {
  async function makeCommercial(overrides: Partial<CommercialKnowledge> = {}): Promise<CommercialKnowledge> {
    const [services, packages] = await Promise.all([
      listServices({ publishedOnly: true }),
      listPricingCatalogItems({ activeOnly: true }),
    ]);
    return { services, packages, ...overrides };
  }

  it("sin commercial (omitido) → los bloques quedan vacíos, nunca lanza", async () => {
    const dict = await getDictionary("es");
    const prompt = buildSystemPrompt(dict, "es");

    expect(prompt).toContain("KNOWLEDGE");
    expect(prompt).not.toContain("CURRENT SERVICE PAGE");
  });

  it("incluye el contenido real de los 5 servicios — definición, incluye y para quién, no dict.services.items legacy", async () => {
    const dict = await getDictionary("es");
    const commercial = await makeCommercial();
    const prompt = buildSystemPrompt(dict, "es", null, commercial);

    for (const slug of ["web-development", "ecommerce", "seo", "automation", "custom-solutions"]) {
      const service = commercial.services.find((s) => s.slug === slug)!;
      expect(prompt).toContain(service.content.es.heading);
      expect(prompt).toContain(`slug: ${slug}`);
    }
    // El texto del legacy dict.services.items (5 títulos distintos a los
    // reales, ej. "Landing pages y campañas") nunca debe aparecer.
    expect(prompt).not.toContain("Landing pages y campañas");
  });

  it("un servicio sin paquete relacionado (SEO/Automation) nunca muestra un precio inventado", async () => {
    const dict = await getDictionary("es");
    const commercial = await makeCommercial();
    const prompt = buildSystemPrompt(dict, "es", null, commercial);

    expect(prompt).toContain("No closed package for this service — pricing is quoted based on project scope, never a specific number.");
  });

  it("International Pricing Phase E — incluye los 5 paquetes web por nombre/slug, SIN ningún precio en prosa (el precio solo viene de get_official_price)", async () => {
    const dict = await getDictionary("es");
    const commercial = await makeCommercial();
    const prompt = buildSystemPrompt(dict, "es", null, commercial);

    expect(prompt).toContain("START (slug: start)");
    expect(prompt).toContain("CUSTOM (slug: custom)");
    expect(prompt).toContain("Call get_official_price for its current price.");
    // Ningún monto de Pricing Core (base COP de START/CUSTOM) debe aparecer.
    expect(prompt).not.toMatch(/799\.000|1\.499\.000/);
  });

  it("International Pricing Phase E — incluye Essential/Growth/Care+ por nombre/slug con features reales, SIN precio en prosa — nombres oficiales exactos", async () => {
    const dict = await getDictionary("es");
    const commercial = await makeCommercial();
    const prompt = buildSystemPrompt(dict, "es", null, commercial);

    expect(prompt).toContain("Essential (slug: essential)");
    expect(prompt).toContain("Growth (slug: growth)");
    expect(prompt).toContain("Care+ (slug: care-plus)");
    // Al menos una feature real del plan Essential debe aparecer.
    expect(prompt).toContain("Actualizaciones técnicas y de seguridad");
    // Ningún monto de Pricing Core (base COP de Essential/Growth/Care+) debe aparecer.
    expect(prompt).not.toMatch(/149\.000|299\.000|499\.000/);
  });

  it("International Pricing Phase E — el tool get_official_price está expuesto como la única fuente de precio en la prosa", async () => {
    const dict = await getDictionary("es");
    const commercial = await makeCommercial();
    const prompt = buildSystemPrompt(dict, "es", null, commercial);

    expect(prompt).toContain("get_official_price(itemSlug)");
    expect(prompt).toMatch(/ONLY source of truth for any price/i);
  });

  it("International Pricing Phase E — micro-fix: priceType FROM debe expresarse como 'desde'/'starting at', nunca como precio final", async () => {
    const dict = await getDictionary("es");
    const commercial = await makeCommercial();
    const prompt = buildSystemPrompt(dict, "es", null, commercial);

    expect(prompt).toMatch(/priceType is "FROM".*MUST preserve that starting-price meaning/i);
    expect(prompt).toMatch(/desde X.*starting at X/i);
  });

  it("activeService → incluye el bloque CURRENT SERVICE PAGE con el servicio correcto", async () => {
    const dict = await getDictionary("es");
    const commercial = await makeCommercial();
    const seo = commercial.services.find((s) => s.slug === "seo")!;
    const prompt = buildSystemPrompt(dict, "es", null, { ...commercial, activeService: seo });

    expect(prompt).toContain("CURRENT SERVICE PAGE");
    expect(prompt).toContain("/services/seo");
    expect(prompt).toContain(seo.content.es.heading);
  });

  it("activeService=null (el caso común) → nunca incluye el bloque CURRENT SERVICE PAGE", async () => {
    const dict = await getDictionary("es");
    const commercial = await makeCommercial({ activeService: null });
    const prompt = buildSystemPrompt(dict, "es", null, commercial);

    expect(prompt).not.toContain("CURRENT SERVICE PAGE");
  });

  it("International Pricing Phase E — la regla anti-alucinación exige la tool para cualquier precio y prohíbe inventar features de paquetes web", async () => {
    const dict = await getDictionary("es");
    const commercial = await makeCommercial();
    const prompt = buildSystemPrompt(dict, "es", null, commercial);

    expect(prompt).toMatch(/NEVER state a price from memory/i);
    expect(prompt).toMatch(/Never invent a package, plan, price, feature, discount, guarantee, or integration/i);
    expect(prompt).toMatch(/NO itemized feature list today/i);
  });

  it("locale='en' → usa el contenido en inglés de cada servicio, no el español", async () => {
    const dict = await getDictionary("en");
    const commercial = await makeCommercial();
    const prompt = buildSystemPrompt(dict, "en", null, commercial);

    const seo = commercial.services.find((s) => s.slug === "seo")!;
    expect(prompt).toContain(seo.content.en.heading);
    expect(prompt).not.toContain(seo.content.es.definition);
  });
});
