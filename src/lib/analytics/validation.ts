import { z } from "zod";
import { ANALYTICS_EVENT_TYPES } from "@/lib/analytics/types";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/);

/**
 * Analytics Phase 7 — shape validation for the PUBLIC event-tracking
 * endpoint (/api/analytics/event). Unlike every other write schema in
 * this codebase, this one is reached by anonymous visitors, not an
 * authenticated admin — kept deliberately narrow: no free-form fields,
 * no arbitrary metadata accepted from the client (metadata is always
 * `{}` server-side for this phase, see analyticsEventStore.ts), nothing
 * here can be used to inject content that later renders as fact
 * anywhere (this table is never read by XAYVEN AI's knowledge or any
 * public page).
 */
export const trackEventSchema = z.object({
  eventType: z.enum(ANALYTICS_EVENT_TYPES),
  serviceSlug: slugSchema.optional(),
  packageSlug: slugSchema.optional(),
  sessionId: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9-]+$/)
    .optional(),
  locale: z.enum(["es", "en"]).optional(),
});

export type TrackEventInput = z.infer<typeof trackEventSchema>;
