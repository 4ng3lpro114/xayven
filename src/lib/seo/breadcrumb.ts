/**
 * SEO/AEO/GEO Phase 8 — BreadcrumbList JSON-LD builder. Pure, reused
 * everywhere a Breadcrumb UI component is rendered (see
 * components/ui/Breadcrumb.tsx) so the visible trail and the structured
 * data can never drift apart — the same `items` array feeds both.
 */
export interface BreadcrumbJsonLdItem {
  name: string;
  url: string;
}

export function buildBreadcrumbJsonLd(items: readonly BreadcrumbJsonLdItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
