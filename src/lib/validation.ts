import { z } from "zod";

/**
 * Shared contact form schema — used both by the client form (for inline
 * validation) and the /api/contact route handler (source of truth).
 */
export const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  projectType: z.string().trim().min(1).max(120),
  budget: z.string().trim().min(1).max(120),
  message: z.string().trim().min(20).max(4000),
  /**
   * Honeypot field — real users never see or fill this in (it's visually
   * hidden). Deliberately accepts any string here so a filled-in value
   * still passes validation; the route handler checks it separately and
   * silently no-ops instead of returning a 400 that would tip off a bot.
   */
  website: z.string().max(200).optional().or(z.literal("")),
});

export type ContactInput = z.infer<typeof contactSchema>;

/**
 * Maintenance request schema — mirrors contactSchema's shape/conventions
 * (shared Zod validation, client + server) with fields specific to people
 * who already have a website.
 */
export const maintenanceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  website: z.string().trim().min(1).max(300).refine((v) => /^https?:\/\/.+\..+/i.test(v), {
    message: "invalid_url",
  }),
  need: z.string().trim().min(1).max(120),
  priority: z.string().trim().min(1).max(120),
  message: z.string().trim().min(10).max(4000),
  /** Honeypot — named differently from contactSchema's since this form has
   *  a real "website" field already. */
  hp: z.string().max(200).optional().or(z.literal("")),
});

export type MaintenanceInput = z.infer<typeof maintenanceSchema>;

/**
 * XAYVEN AI chat turn — one visitor message per request. sessionId is a
 * client-generated, non-guessable id (see ChatWidget) used only to group
 * messages into a conversation; it is not an auth token.
 */
export const chatTurnSchema = z.object({
  sessionId: z
    .string()
    .trim()
    .min(16)
    .max(128)
    .regex(/^[a-zA-Z0-9-]+$/),
  message: z.string().trim().min(1).max(2000),
  locale: z.enum(["es", "en"]),
  /**
   * Fase 11 Etapa A — only ever sent by ChatWidget's own promotion-CTA
   * handoff (see clientSession.ts's setPromotionContext/
   * consumePromotionContext), never a regular typed message. A
   * well-formed but non-existent/inactive id is NOT a validation error —
   * the route re-validates it server-side and silently skips attribution
   * rather than failing the whole turn over a stale/tampered id (see
   * /api/ai/chat/route.ts). Malformed non-UUID input IS rejected here,
   * since that can only mean a bug or tampering, never a legitimate late
   * promotion.
   */
  promotionId: z.string().uuid().optional(),
});

export type ChatTurnInput = z.infer<typeof chatTurnSchema>;
