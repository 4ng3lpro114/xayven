import type { Locale } from "@/lib/i18n/config";

/**
 * Services domain model — Phase 1 of the Services/Commercial Platform
 * arc. Mirrors the structure of src/lib/pricing/types.ts and
 * src/lib/promotions/types.ts (each commercial domain gets its own file,
 * never merged into an existing one).
 *
 * See supabase/migrations/0017_services.sql for the exact schema this
 * maps to.
 *
 * Content model vs. Pricing model (resolving the dictionary/DB conflict
 * the audit flagged): a Service's editorial copy (this file) is now the
 * source of truth for /services and /services/[slug] — it REPLACES
 * dict.services.items, which becomes legacy/unused once the pages are
 * migrated in Phase 2/3 (not deleted from the dictionaries in this phase
 * — that's a page-level change, out of scope for the domain layer).
 * Prices/packages are NEVER duplicated here — `relatedPackageSlugs`
 * references src/lib/pricing/types.ts's PricingCatalogItem by `slug`
 * only, resolved at render/knowledge-build time.
 */

export interface ServiceFaqItem {
  question: string;
  answer: string;
}

export interface ServiceForWhom {
  idealIf: string[];
  /** Optional — only populated when it adds real value (see the master
   *  prompt's editorial rule). An empty array means "not applicable",
   *  never a placeholder. */
  notIdealIf: string[];
}

/**
 * Full editorial content for one locale. Every field here must be real,
 * specific, non-generic copy — no "llevamos tu negocio al siguiente
 * nivel" filler (explicit rule from the master prompt's AEO/GEO section).
 */
export interface ServiceContent {
  /** H1 / hero heading — e.g. "Diseño y desarrollo web". */
  heading: string;
  /** Short supporting line under the heading. */
  tagline: string;
  /** "¿Qué es [servicio]?" — a literal, self-sufficient definition. */
  definition: string;
  /** Concrete problems this service solves — never vague. */
  problem: string[];
  /** How XAYVEN specifically approaches those problems (one developed
   *  paragraph, not a slogan). */
  solution: string;
  /** Only capabilities XAYVEN genuinely supports today — never invented. */
  includes: string[];
  forWhom: ServiceForWhom;
  /** Situational examples — never fabricated clients/metrics. Real
   *  published projects are linked separately via /work, not invented
   *  here. */
  useCases: string[];
  /** ~8 real, specific Q&A pairs — never keyword-stuffed filler. */
  faq: ServiceFaqItem[];
}

export interface Service {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Stable route identifier: /services/[slug]. Never changes once
   *  published — see the migration's own comment. */
  slug: string;
  /** Deliberate display order in /services — not alphabetical. */
  displayOrder: number;
  /** Soft-state, same discipline as PricingCatalogItem.isActive /
   *  Project.published — never a physical delete. */
  isPublished: boolean;
  /** References src/lib/pricing/types.ts's PricingCatalogItem.slug —
   *  never a foreign key, never duplicated pricing data. Can be empty
   *  (quote-based service, e.g. SEO/Automation today). A slug that no
   *  longer resolves against pricing_catalog is silently dropped at
   *  render time — never breaks the page. */
  relatedPackageSlugs: string[];
  content: Record<Locale, ServiceContent>;
}

export type CreateServiceInput = Omit<Service, "id" | "createdAt" | "updatedAt">;

/** `slug` is deliberately excluded from generic edits — same discipline
 *  as UpdatePromotionInput never carrying `status`. Changing a slug once
 *  published would break every already-indexed URL; if that's ever truly
 *  needed it should be a distinct, deliberate action, not a side effect
 *  of an unrelated content edit. */
export type UpdateServiceInput = Partial<Omit<CreateServiceInput, "slug">>;
