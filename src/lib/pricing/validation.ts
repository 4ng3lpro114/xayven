import { z } from "zod";

/**
 * Pricing Core — shape validation. No write route exists yet in this
 * phase (the catalog is seeded once via the migration, read-only from the
 * app's perspective) — this schema exists now so a future admin
 * create/edit flow can reuse it directly instead of re-deriving these
 * same rules, same reasoning as promotions/validation.ts being written
 * once and shared by both its create and edit routes.
 */

const categorySchema = z.enum(["package", "maintenance"]);
const billingIntervalSchema = z.enum(["ONE_TIME", "MONTHLY"]);
const priceTypeSchema = z.enum(["FIXED", "FROM"]);
const currencySchema = z.enum(["COP", "USD"]);

/** Pre-Production Correction R1 — feature bullets per locale. Empty
 *  arrays are valid (the 5 web packages have none); each individual
 *  bullet just can't be blank. */
const featuresSchema = z.object({
  es: z.array(z.string().trim().min(1).max(200)),
  en: z.array(z.string().trim().min(1).max(200)),
});

export const pricingCatalogItemSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "El slug solo puede tener minúsculas, números y guiones."),
  name: z.string().trim().min(1).max(80),
  category: categorySchema,
  billingInterval: billingIntervalSchema,
  priceType: priceTypeSchema,
  basePrice: z.number().int().positive(),
  currency: currencySchema,
  isActive: z.boolean(),
  features: featuresSchema,
});

export type PricingCatalogItemInput = z.infer<typeof pricingCatalogItemSchema>;

/**
 * Admin Phase 5 — write schemas. `createPricingCatalogItemSchema` is the
 * same shape as above (kept as a separate export so create/update can
 * diverge independently later, same convention as
 * services/validation.ts). `updatePricingCatalogItemSchema` deliberately
 * excludes `slug`/`category`/`billingInterval` — these define WHAT the
 * item fundamentally is (a package vs. a maintenance plan, one-time vs.
 * monthly); changing them post-creation isn't a price/name edit, it's a
 * different product. Same "identity fields are immutable after creation"
 * discipline as Service.slug (services/types.ts) and Promotion.status.
 */
export const createPricingCatalogItemSchema = pricingCatalogItemSchema;

export const updatePricingCatalogItemSchema = pricingCatalogItemSchema
  .omit({ slug: true, category: true, billingInterval: true })
  .partial();

export type UpdatePricingCatalogItemInput = z.infer<typeof updatePricingCatalogItemSchema>;
