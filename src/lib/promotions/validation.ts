import { z } from "zod";
import type { PromotionDiscountType } from "@/lib/promotions/types";

/**
 * Fase 11B — shared between the create route (full schema) and the edit
 * route (same per-field rules, applied to whatever subset is present).
 *
 * Cross-field rules (percentage <= 100, currency required per
 * discount_type, end_at > start_at) are NOT baked into the update schema
 * as a partial-aware `.superRefine` — a patch that only changes `text`
 * has no dates/discount fields to cross-check against each other, only
 * against the EXISTING row. Instead, `validateFinalPromotionShape()`
 * below runs once, in the route, against the fully merged object
 * (existing row + patch) right before writing — the single place that
 * actually knows the true final state. `createPromotionSchema` runs the
 * same two functions against the request body directly, since a brand
 * new promotion's "final state" IS the request body.
 */

const discountTypeSchema = z.enum(["percentage", "fixed_amount", "special_price"]);
const audienceSchema = z.enum(["new_users", "existing_clients", "all"]);
const currencySchema = z.enum(["COP", "USD"]).nullable();
const isoDateSchema = z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), {
  message: "Fecha inválida.",
});

export const createPromotionSchema = z.object({
  name: z.string().trim().min(2).max(160),
  text: z.string().trim().min(1).max(500),
  discountType: discountTypeSchema,
  discountValue: z.number().positive(),
  currency: currencySchema,
  startAt: isoDateSchema,
  endAt: isoDateSchema,
  audience: audienceSchema,
  ctaLabel: z.string().trim().min(1).max(80),
  // Nullable/optional — see the doc comment on Promotion.ctaMessage in
  // types.ts for why this isn't required like ctaLabel is. Same max-length
  // discipline as the other free-text fields (name/text/ctaLabel above) —
  // a chat-opening line, not a paragraph.
  ctaMessage: z.string().trim().max(300).nullable().optional(),
});

/** Every field optional (partial edit) — but any field that IS present
 *  still passes its own per-field rule. Cross-field consistency of the
 *  final merged state is checked separately, see the module doc comment. */
export const updatePromotionSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  text: z.string().trim().min(1).max(500).optional(),
  discountType: discountTypeSchema.optional(),
  discountValue: z.number().positive().optional(),
  currency: currencySchema.optional(),
  startAt: isoDateSchema.optional(),
  endAt: isoDateSchema.optional(),
  audience: audienceSchema.optional(),
  ctaLabel: z.string().trim().min(1).max(80).optional(),
  ctaMessage: z.string().trim().max(300).nullable().optional(),
});

export interface FinalPromotionShapeErrors {
  [field: string]: string;
}

/**
 * Validates the cross-field rules against a FINAL, fully-resolved shape —
 * called with the raw create body, or with (existing row merged with a
 * patch) for edits. Returns an empty object when everything is
 * consistent — never throws, so callers decide how to report it (matches
 * the rest of this codebase's "validation_failed" convention rather than
 * a generic 500).
 */
export function validateFinalPromotionShape(input: {
  discountType: PromotionDiscountType;
  discountValue: number;
  currency: string | null;
  startAt: string;
  endAt: string;
}): FinalPromotionShapeErrors {
  const errors: FinalPromotionShapeErrors = {};

  if (input.discountType === "percentage" && input.discountValue > 100) {
    errors.discountValue = "El porcentaje no puede ser mayor a 100.";
  }
  if (input.discountType === "percentage" && input.currency !== null) {
    errors.currency = "Un descuento porcentual no lleva moneda.";
  }
  if (input.discountType !== "percentage" && input.currency === null) {
    errors.currency = "Este tipo de descuento requiere una moneda.";
  }
  if (new Date(input.endAt).getTime() <= new Date(input.startAt).getTime()) {
    errors.endAt = "La fecha final debe ser posterior a la fecha de inicio.";
  }

  return errors;
}
