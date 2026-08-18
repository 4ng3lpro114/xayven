import type { Locale } from "@/lib/i18n/config";

/**
 * Pricing Core — domain model. Mirrors the structure of
 * src/lib/promotions/types.ts (its own domain-specific types file) — a
 * new domain gets its own file, not merged into an existing one.
 *
 * See supabase/migrations/0014_pricing_catalog.sql for the exact schema
 * this maps to, and the commercial audit for why this exists: today
 * `project.totalAmount` is a number an admin types by hand, with zero
 * catalog behind it. This is the first real source of truth.
 */

/** 'package' = the 5 web packages (START..CUSTOM). 'maintenance' = the 3
 *  maintenance plans (Essential/Growth/Care+). Enum-via-union, same
 *  extensibility discipline as every other closed enum in this codebase
 *  (PaymentType, PromotionStatus, ...) — a 3rd category needs a matching
 *  migration widening the DB CHECK, never a silent new string. */
export type PricingCategory = "package" | "maintenance";

/** ONE_TIME = the 5 packages. MONTHLY = the 3 maintenance plans. No
 *  recurring-billing engine exists yet (deliberately out of scope — see
 *  the commercial audit) — this only describes HOW the price is framed,
 *  never triggers an actual recurring charge. */
export type PricingBillingInterval = "ONE_TIME" | "MONTHLY";

/** FIXED = closed price (START, PROFESSIONAL, BUSINESS, Essential,
 *  Growth, Care+). FROM = a starting-from price (E-COMMERCE, CUSTOM) —
 *  never treated as a mandatory/exact amount by any future consumer. */
export type PricingType = "FIXED" | "FROM";

/**
 * Full catalog item. `slug` is the stable identifier any future relation
 * (projects, promotions) should reference — never `name` or `id` alone
 * for display purposes, since `name` must stay literally exact
 * ("Essential"/"Growth"/"Care+" are official names) and could still be
 * corrected for typos without breaking a reference.
 */
export interface PricingCatalogItem {
  id: string;
  createdAt: string;
  updatedAt: string;
  slug: string;
  name: string;
  category: PricingCategory;
  billingInterval: PricingBillingInterval;
  priceType: PricingType;
  /** Integer, no decimals — same discipline as Project.totalAmount/
   *  Payment.amount. For `priceType: "FROM"`, this is the starting-from
   *  floor, never a fixed/final amount. */
  basePrice: number;
  currency: string;
  /** Soft-state — a deactivated item is never physically deleted (same
   *  principle as promotions being archived, never dropped). */
  isActive: boolean;
  /** Pre-Production Correction R1 — feature bullets per locale. Single
   *  source of truth for what a MAINTENANCE plan includes (Essential/
   *  Growth/Care+); consumed by /maintenance, Admin, and XAYVEN AI alike
   *  — replaces the old dict.maintenance.plans[].features duplication.
   *  Empty arrays for the 5 web packages (category="package") — their
   *  "what's included" lives in each related Service's own
   *  content.includes instead, see services/types.ts. */
  features: Record<Locale, string[]>;
}
