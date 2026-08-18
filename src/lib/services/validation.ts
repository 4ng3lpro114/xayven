import { z } from "zod";

/**
 * Services domain — shape validation. Mirrors src/lib/pricing/validation.ts
 * and src/lib/promotions/validation.ts's conventions. No write route exists
 * yet (Admin CRUD is a later phase) — written now so that phase reuses
 * these schemas directly instead of re-deriving the same rules.
 */

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/, "El slug solo puede tener minúsculas, números y guiones.");

const faqItemSchema = z.object({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(2000),
});

const forWhomSchema = z.object({
  idealIf: z.array(z.string().trim().min(1).max(300)),
  notIdealIf: z.array(z.string().trim().min(1).max(300)),
});

export const serviceContentSchema = z.object({
  heading: z.string().trim().min(1).max(160),
  tagline: z.string().trim().min(1).max(300),
  definition: z.string().trim().min(1).max(2000),
  problem: z.array(z.string().trim().min(1).max(400)).min(1),
  solution: z.string().trim().min(1).max(3000),
  includes: z.array(z.string().trim().min(1).max(200)).min(1),
  forWhom: forWhomSchema,
  useCases: z.array(z.string().trim().min(1).max(500)),
  faq: z.array(faqItemSchema),
});

export const createServiceSchema = z.object({
  slug: slugSchema,
  displayOrder: z.number().int().min(0),
  isPublished: z.boolean(),
  relatedPackageSlugs: z.array(slugSchema),
  content: z.object({
    es: serviceContentSchema,
    en: serviceContentSchema,
  }),
});

/** `slug` deliberately excluded — see UpdateServiceInput's doc comment in
 *  types.ts for why. */
export const updateServiceSchema = createServiceSchema.omit({ slug: true }).partial();

export type CreateServiceValidatedInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceValidatedInput = z.infer<typeof updateServiceSchema>;
