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

export interface ConversationCounts {
  total: number;
  exploring: number;
  interested: number;
  hot: number;
  client: number;
  support: number;
}
