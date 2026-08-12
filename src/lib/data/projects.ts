import type { Locale } from "@/lib/i18n/config";

export type ProjectType = "real" | "concept";

export interface ProjectCopy {
  title: string;
  category: string;
  summary: string;
  problem: string;
  goal: string;
  solution: string;
  design: string;
  tech: string;
  result: string;
}

export interface Project {
  slug: string;
  type: ProjectType;
  year: string;
  stack: string[];
  /** Visual accent used for the generated cover art — keeps every cover
   *  consistent with the brand system instead of using stock imagery. */
  accent: "violet" | "ink" | "duotone";
  /** Defaults to true when omitted. Set to `false` to temporarily hide a
   *  project from every public listing (/work, homepage, sitemap, the AI's
   *  knowledge base) and make its individual page 404 — without deleting
   *  its definition. See work/page.tsx, work/[slug]/page.tsx,
   *  SelectedWork.tsx, sitemap.ts and ai/knowledge.ts, all of which filter
   *  on this same field. */
  published?: boolean;
  es: ProjectCopy;
  en: ProjectCopy;
}

export const projects: Project[] = [
  {
    slug: "tartalia-reposteria",
    type: "real",
    year: "2025",
    stack: ["Next.js", "TypeScript", "SEO técnico", "JSON-LD"],
    accent: "violet",
    es: {
      title: "Tartalia Repostería",
      category: "Ecommerce · Diseño y desarrollo web",
      summary:
        "Sitio web para una repostería real, con catálogo de productos, pedidos, reservas y una base SEO completa.",
      problem:
        "Tartalia necesitaba una presencia web propia para mostrar su catálogo y recibir pedidos, en lugar de depender solo de redes sociales.",
      goal:
        "Construir un sitio propio que permitiera pedidos y reservas, mostrando el catálogo de forma clara y atractiva para clientes que compran principalmente desde el móvil.",
      solution:
        "Diseño y desarrollo de un sitio completo: catálogo de productos, flujo de pedidos y reservas, páginas legales (términos y privacidad), y una estructura técnica orientada a SEO — metadata, sitemap.xml, robots.txt y datos estructurados JSON-LD.",
      design:
        "Estética cálida y apetitosa, coherente con la marca, con foco en la fotografía de producto y una navegación simple pensada para compras desde el celular.",
      tech: "Desarrollo a medida con foco en rendimiento, SEO técnico y estructura de datos semántica.",
      result:
        "Sitio publicado y operativo, con catálogo, pedidos, reservas y bases SEO en producción.",
    },
    en: {
      title: "Tartalia Repostería",
      category: "Ecommerce · Web design & development",
      summary:
        "A website for a real bakery business, with a product catalog, ordering, reservations and a complete SEO foundation.",
      problem:
        "Tartalia needed its own web presence to showcase its catalog and take orders, instead of relying only on social media.",
      goal:
        "Build a site that supported orders and reservations, presenting the catalog clearly for customers shopping mostly from their phones.",
      solution:
        "Design and development of a complete site: product catalog, ordering and reservation flow, legal pages (terms and privacy), and an SEO-oriented technical structure — metadata, sitemap.xml, robots.txt and JSON-LD structured data.",
      design:
        "A warm, appetite-driving aesthetic aligned with the brand, with a focus on product photography and simple navigation for mobile shoppers.",
      tech: "Custom development focused on performance, technical SEO and semantic data structure.",
      result: "A published, operating site — catalog, ordering, reservations and SEO foundations in production.",
    },
  },
  {
    slug: "tienda-jardin-antioquia",
    type: "concept",
    year: "2026",
    stack: ["Dirección de arte", "Identidad visual", "Prototipo de producto"],
    accent: "ink",
    published: false,
    es: {
      title: "Tienda local — Jardín, Antioquia",
      category: "Diseño web · Concepto",
      summary:
        "Exploración conceptual para un comercio local en Jardín, Antioquia — pensada para negocios de pueblo que quieren dar el salto a una presencia digital profesional sin perder su identidad.",
      problem:
        "Muchos negocios locales en pueblos como Jardín no tienen presencia digital propia, o dependen únicamente de redes sociales.",
      goal:
        "Explorar una dirección visual y de producto que muestre cómo un comercio local puede tener una web profesional sin perder su calidez.",
      solution:
        "Propuesta de estructura de navegación, identidad visual y catálogo simplificado, pensada como punto de partida para un futuro desarrollo real.",
      design:
        "Paleta cálida inspirada en el entorno cafetero, tipografía legible y una estructura simple, pensada para dueños de negocio con poca experiencia digital.",
      tech: "Concepto de producto y diseño. Desarrollo aún no iniciado.",
      result: "Proyecto conceptual — todavía no desarrollado ni publicado.",
    },
    en: {
      title: "Local store — Jardín, Antioquia",
      category: "Web design · Concept",
      summary:
        "A conceptual exploration for a local shop in Jardín, Antioquia — designed for small-town businesses ready to make the jump to a professional digital presence without losing their identity.",
      problem:
        "Many local businesses in towns like Jardín have no digital presence of their own, or rely only on social media.",
      goal:
        "Explore a visual and product direction that shows how a local shop can have a professional website without losing its warmth.",
      solution:
        "A proposal for navigation structure, visual identity and a simplified catalog, meant as a starting point for future real development.",
      design:
        "A warm palette inspired by the coffee-growing region, legible typography and a simple structure, designed for business owners with little digital experience.",
      tech: "Product and design concept. Development not yet started.",
      result: "Concept project — not yet developed or published.",
    },
  },
  {
    slug: "estudio-inmobiliario-concepto",
    type: "concept",
    year: "2026",
    stack: ["Dirección de arte", "UX de búsqueda", "Prototipo de producto"],
    accent: "duotone",
    published: false,
    es: {
      title: "Inmobiliaria boutique",
      category: "Diseño web · Concepto",
      summary:
        "Exploración conceptual para una inmobiliaria boutique — un sitio enfocado en mostrar propiedades con claridad y generar contacto directo con agentes.",
      problem: "Los listados inmobiliarios suelen ser difíciles de navegar y no transmiten confianza.",
      goal: "Diseñar una experiencia de búsqueda de propiedades simple, con foco en fotografía y contacto directo.",
      solution:
        "Propuesta de estructura de navegación, ficha de propiedad y flujo de contacto — sin desarrollo todavía.",
      design: "Diseño limpio, tipografía editorial y fotografía a pantalla completa como protagonista.",
      tech: "Concepto de producto y diseño. Desarrollo aún no iniciado.",
      result: "Proyecto conceptual — todavía no desarrollado ni publicado.",
    },
    en: {
      title: "Boutique real estate",
      category: "Web design · Concept",
      summary:
        "A conceptual exploration for a boutique real estate agency — a site focused on presenting listings clearly and driving direct contact with agents.",
      problem: "Real estate listings are often hard to navigate and fail to build trust.",
      goal: "Design a simple property search experience, with a focus on photography and direct contact.",
      solution: "A proposal for navigation structure, listing pages and a contact flow — not yet developed.",
      design: "Clean design, editorial typography and full-bleed photography as the main character.",
      tech: "Product and design concept. Development not yet started.",
      result: "Concept project — not yet developed or published.",
    },
  },
];

export function getProjectCopy(project: Project, locale: Locale): ProjectCopy {
  return locale === "en" ? project.en : project.es;
}

export function getProjectBySlug(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}
