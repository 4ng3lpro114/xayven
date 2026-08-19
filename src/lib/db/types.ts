import type { Locale } from "@/lib/i18n/config";

export type LeadStatus = "exploring" | "interested" | "hot" | "client" | "support";
export type ConsentStatus = "pending" | "granted" | "declined";
export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  createdAt: string; // ISO timestamp
}

/**
 * A single XAYVEN AI conversation. Every field beyond id/sessionId/locale/
 * messages is optional by design — see Fase 3 (progressive capture): we
 * only fill in what the assistant genuinely detects, never a blank form.
 */
export interface Conversation {
  id: string;
  sessionId: string;
  locale: Locale;
  createdAt: string;
  updatedAt: string;
  status: "active" | "closed";
  messages: ChatMessage[];

  /** Set once (and only once, permanently) this lead is converted into a
   *  real `clients` row — see src/lib/leads/conversion.ts. Null for the
   *  overwhelming majority of conversations, which never convert. */
  clientId: string | null;
  /** ISO timestamp of the moment this conversation converted to a client
   *  for the FIRST time — set once, in convertConversationToClient(),
   *  never overwritten afterward (Fase 9B). Null for conversations that
   *  never converted, AND for conversations that converted before this
   *  field existed — that's intentional, never backfilled/reconstructed
   *  (see supabase/migrations/0004_conversations_converted_at.sql). Do
   *  NOT assume `clientId !== null` implies `convertedAt !== null`. */
  convertedAt: string | null;

  /** Fase 11 Etapa A (0013_conversations_promotion_id.sql) — set at most
   *  once, the first time a visitor opens the chat via a promotion's CTA
   *  (first-touch, sticky — a later CTA click during the same
   *  conversation never overwrites it). Server-validated before being
   *  set (see /api/ai/chat/route.ts): only a promotion that is really
   *  `getEffectivePromotionStatus() === "active"` at that moment can ever
   *  be attributed, never a client-asserted claim taken at face value.
   *  Null for the overwhelming majority of conversations, which never
   *  originate from a promotion. */
  promotionId: string | null;

  /** Services Phase 3 (0018_conversations_service_page_slug.sql) — set at
   *  most once, the first time a visitor opens the chat via a service
   *  detail page's AI CTA (first-touch, sticky — same discipline as
   *  promotionId above, never overwritten by a later message). Server-
   *  validated before being set (see /api/ai/chat/route.ts): only a slug
   *  that resolves to a real, published service can ever be attributed.
   *  Deliberately a slug, not a services.id FK — see the migration's own
   *  comment. Null for the overwhelming majority of conversations. */
  servicePageSlug: string | null;

  visitorName: string | null;
  visitorEmail: string | null;
  /** Only ever filled in if the visitor shares it voluntarily in the chat —
   *  never requested outright. Powers the admin panel's WhatsApp action. */
  visitorPhone: string | null;
  company: string | null;
  website: string | null;
  projectType: string | null;
  need: string | null;
  goal: string | null;
  budget: string | null;
  urgency: string | null;

  leadScore: number;
  leadStatus: LeadStatus;
  aiSummary: string | null;
  consentStatus: ConsentStatus;
}

/** Fields the AI is allowed to progressively fill in on a conversation. */
export type ExtractedFields = Partial<
  Pick<
    Conversation,
    | "visitorName"
    | "visitorEmail"
    | "visitorPhone"
    | "company"
    | "website"
    | "projectType"
    | "need"
    | "goal"
    | "budget"
    | "urgency"
  >
>;

export interface MaintenanceRequest {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  company: string | null;
  website: string;
  need: string;
  priority: string;
  message: string;
  status: "new" | "contacted" | "resolved";
}

/** Submissions from the public "Crear mi proyecto" CTA → /contact form
 *  (POST /api/contact). Similar status-lifecycle shape as
 *  MaintenanceRequest, but a deliberately separate table/type — see
 *  0007_contact_requests.sql for why these two domains (prospect asking
 *  for a new site vs. existing client asking for support) aren't merged
 *  into one shape.
 *
 * `status: "converted"` and `clientId` are only ever set together, by
 * src/lib/leads/contactRequestConversion.ts — never manually (see
 * ContactRequestActions.tsx: the manual status toggle never offers
 * "converted" as an option), so a request can never be "converted" without
 * a real, valid `clientId` pointing at it. */
export interface ContactRequest {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  company: string | null;
  projectType: string;
  budget: string;
  message: string;
  status: "new" | "contacted" | "converted";
  /** Set once, by convertContactRequestToClient() — never touched by the
   *  manual status-change route. Nullable/ON DELETE SET NULL at the DB
   *  level (0007_contact_requests.sql), same reasoning as
   *  conversations.client_id: the request is a historical record that
   *  must survive even if the client it points to is later deleted. */
  clientId: string | null;
  /** Set once, in the SAME write as clientId/status="converted" (see
   *  linkContactRequestToClient()) — the exact `created` value
   *  createClientOrGetExisting() returned at conversion time, persisted
   *  so the admin UI can honestly show "cliente creado" vs "cliente ya
   *  existente" after a reload, without ever inferring it from
   *  created_at/IDs. `null` means this request was converted before
   *  0009_contact_requests_client_was_created.sql existed — never
   *  guessed, shown as a neutral "Cliente asociado" state instead. */
  clientWasCreated: boolean | null;
  /** Resolved server-side against pricing_catalog at submission time (see
   *  /api/contact/route.ts) — never a raw client-supplied slug. `null`
   *  means no package was selected: a personalized-proposal entry point
   *  (Flujo B), a direct /contact visit (Flujo C), or any request created
   *  before this column existed (0015_contact_requests_pricing_catalog_id.sql).
   *  Never treated as an error state. */
  pricingCatalogId: string | null;

  /** XAYVEN CORE Phase 1 — commercial context, resolved server-side ONLY
   *  (resolveCommercialMarket()/resolveDisplayCurrency()/
   *  resolveOfficialPrice()/withDisplayPrice(), see /api/contact/route.ts)
   *  — never a client-supplied value; contactSchema doesn't even define
   *  these as accepted fields. `marketCode`/`displayCurrency` are captured
   *  whenever a market resolves, independent of whether a package was
   *  selected. `officialAmount`/`officialCurrency` are null together —
   *  either both are set (a package was selected AND Pricing Core had a
   *  real number to show) or neither is. All four null together means
   *  either "no package was selected" or "this request predates
   *  0026_contact_requests_commercial_context.sql" — never distinguished,
   *  same discipline as pricingCatalogId above. */
  marketCode: string | null;
  displayCurrency: string | null;
  /** Whole-unit integer, never a formatted string — e.g. 2299, not
   *  "€2.299". Denominated in `displayCurrency`/`officialCurrency`. */
  officialAmount: number | null;
  officialCurrency: string | null;
}

export interface ConversationCounts {
  total: number;
  exploring: number;
  interested: number;
  hot: number;
  client: number;
  support: number;
}

/**
 * Fase 9C — lead_status_history. Who actually performed a change vs. the
 * exact mechanism that produced it are two different questions worth
 * keeping separate: `changedBy` is coarse ("a human admin" / "the AI
 * scoring logic" / reserved for future automation), `source` is the exact
 * write-point (see src/lib/leads/leadStatus.ts) — the only 3 that exist
 * today, matching the Fase 9C audit exactly. Never invent a 4th without a
 * matching new write-point and a migration to widen the CHECK constraint.
 */
export type LeadStatusChangedBy = "ai" | "admin" | "system";
export type LeadStatusChangeSource = "ai_chat_turn" | "admin_manual_status_change" | "lead_conversion";

/** One row = one REAL transition (`fromStatus !== toStatus`) — never a
 *  snapshot, never synthesized for a conversation's initial/current state.
 *  See supabase/migrations/0005_lead_status_history.sql. */
export interface LeadStatusHistoryEntry {
  id: string;
  conversationId: string;
  /** Snapshot of the conversation's client_id at the moment of the
   *  change — null if not yet converted, or if the client was later
   *  deleted (ON DELETE SET NULL, same as conversations.client_id). */
  clientId: string | null;
  /** Null only in principle — in practice every row logged by
   *  changeLeadStatus() has a real previous status, since no "creation"
   *  event is ever recorded (see the Fase 9C audit, §K). */
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus;
  changedAt: string;
  changedBy: LeadStatusChangedBy;
  source: LeadStatusChangeSource;
  metadata: Record<string, unknown>;
}
