import { describe, it, expect } from "vitest";
import { buildBreadcrumbJsonLd } from "../breadcrumb";

describe("buildBreadcrumbJsonLd (SEO/AEO/GEO Phase 8)", () => {
  it("produce un BreadcrumbList válido con posiciones 1-based", () => {
    const jsonLd = buildBreadcrumbJsonLd([
      { name: "Home", url: "https://xayven.com/es" },
      { name: "Services", url: "https://xayven.com/es/services" },
      { name: "SEO", url: "https://xayven.com/es/services/seo" },
    ]);

    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("BreadcrumbList");
    expect(jsonLd.itemListElement).toHaveLength(3);
    expect(jsonLd.itemListElement[0]).toEqual({
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://xayven.com/es",
    });
    expect(jsonLd.itemListElement[2]).toMatchObject({ position: 3, name: "SEO" });
  });

  it("lista vacía → itemListElement vacío, nunca lanza", () => {
    expect(buildBreadcrumbJsonLd([]).itemListElement).toEqual([]);
  });
});
