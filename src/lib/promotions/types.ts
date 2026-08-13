/**
 * Fase 11B — promotions domain model. Mirrors the structure of
 * src/lib/payments/types.ts (its own domain-specific types file, separate
 * from src/lib/db/types.ts) — a new domain gets its own file, not merged
 * into an existing one.
 *
 * See supabase/migrations/0006_promotions.sql for the exact schema this
 * maps to, and the Fase 11A audit for why each field exists.
 */

/** Only 4 values are ever STORED — see PromotionEffectiveStatus below for
 *  the 2 additional values ("active"/"expired") that only ever exist as a
 *  computed result, never written to the database. */
export type PromotionStatus = "draft" | "scheduled" | "paused" | "archived";

/** What getEffectivePromotionStatus() returns — see
 *  src/lib/promotions/effectiveStatus.ts. This is what admin UI and any
 *  public-facing code actually display; PromotionStatus is only the
 *  column value. */
export type PromotionEffectiveStatus = "draft" | "scheduled" | "active" | "paused" | "expired" | "archived";

/** Fase 11B scope — only these 3. Never invent a 4th without a matching
 *  migration widening the CHECK constraint (same discipline already
 *  applied to LeadStatus/PaymentType/ProjectStatus in this codebase). */
export type PromotionAudience = "new_users" | "existing_clients" | "all";

export type PromotionDiscountType = "percentage" | "fixed_amount" | "special_price";

/**
 * Full internal record — admin-only. Never sent to the public web; see
 * PublicPromotion for what a visitor-facing consumer actually receives.
 */
export interface Promotion {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  /** Visitor-facing copy — always hand-written by the admin, never
   *  generated from discountType/discountValue (see the Fase 11A audit
   *  §2.4: the structured discount fields exist for filtering/Analytics,
   *  never as a template for what a visitor reads). */
  text: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  /** Null only when discountType is "percentage" (meaningless there) —
   *  required for "fixed_amount"/"special_price", enforced by the DB
   *  CHECK constraint, never left ambiguous. */
  currency: string | null;
  startAt: string;
  endAt: string;
  audience: PromotionAudience;
  status: PromotionStatus;
  ctaLabel: string;
  /** The message XAYVEN AI will receive once the CTA is wired to the chat
   *  (a LATER phase, not implemented here — see clientSession.ts's
   *  setDiagnosisContext()/openChatWidget() for the mechanism this will
   *  eventually reuse). Null is the common case in Fase 11B, since
   *  nothing reads this yet — nullable, unlike `ctaLabel` (always
   *  rendered today, so always required). */
  ctaMessage: string | null;
  /** Reserved, unused in Fase 11B — see the migration's header comment. */
  metadata: Record<string, unknown>;
  /** Reserved, unused in Fase 11B — future segmentation, never read or
   *  written by anything in this phase. */
  audienceRules: Record<string, unknown> | null;
}

/** What createPromotion() accepts — everything a real promotion needs
 *  except the fields the store itself owns (id/timestamps/status
 *  defaults). `status` is optional and defaults to "draft" — a promotion
 *  is never created already "scheduled" by accident. */
export interface CreatePromotionInput {
  name: string;
  text: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  currency: string | null;
  startAt: string;
  endAt: string;
  audience: PromotionAudience;
  ctaLabel: string;
  /** Optional — see the doc comment on Promotion.ctaMessage. */
  ctaMessage?: string | null;
  status?: PromotionStatus;
}

/** What updatePromotion() accepts — every field EXCEPT status, which only
 *  ever changes through pausePromotion()/resumePromotion()/
 *  archivePromotion() (see promotionStore.ts) — never through a generic
 *  edit, same discipline as changeLeadStatus() being the one sanctioned
 *  writer for conversations.lead_status (Fase 9C). */
export type UpdatePromotionInput = Partial<Omit<CreatePromotionInput, "status">>;

/**
 * Fase 11A audit §11/§17: the public projection never exposes
 * created_by, metadata, audience_rules, or the admin-only `name`/
 * `audience` fields (audience filtering already happened server-side by
 * the time this reaches a caller — re-exposing it would leak internal
 * targeting logic for no reason a public consumer needs). This is a
 * SEPARATE type from Promotion specifically so a future internal field
 * added to Promotion never leaks by accident — it would have to be added
 * here explicitly too.
 */
export interface PublicPromotion {
  id: string;
  text: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  currency: string | null;
  startAt: string;
  endAt: string;
  ctaLabel: string;
  /** Not consumed by anything yet (no chat integration in Fase 11B) — but
   *  a future CTA button needs to read this from the SAME public
   *  projection it already gets ctaLabel from, so it's included here now
   *  rather than requiring a second, separate fetch later. */
  ctaMessage: string | null;
}
