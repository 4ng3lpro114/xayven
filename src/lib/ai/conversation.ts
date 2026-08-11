import "server-only";
import type { Conversation, ExtractedFields, LeadStatus } from "@/lib/db/types";

const JSON_BLOCK_RE = /```json\s*([\s\S]*?)\s*```/i;
const EXTRACTABLE_KEYS = [
  "visitorName",
  "visitorEmail",
  "visitorPhone",
  "company",
  "website",
  "projectType",
  "need",
  "goal",
  "budget",
  "urgency",
] as const;

interface ParsedAIResponse {
  /** Natural-language reply, with the trailing JSON block stripped out. */
  reply: string;
  extracted: ExtractedFields;
  suggestedLeadStatus: LeadStatus | null;
}

/**
 * Splits the model's raw output into the visible reply and the trailing
 * structured-extraction block (see knowledge.ts "DATA EXTRACTION"). Parsing
 * failures degrade to "just show the reply, extract nothing" — a malformed
 * JSON block must never break the chat.
 */
export function parseAIResponse(raw: string): ParsedAIResponse {
  const match = raw.match(JSON_BLOCK_RE);
  const reply = (match ? raw.slice(0, match.index) : raw).trim();

  if (!match) return { reply, extracted: {}, suggestedLeadStatus: null };

  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>;
    const extracted: ExtractedFields = {};

    for (const key of EXTRACTABLE_KEYS) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim().length > 0 && value.trim().length < 300) {
        extracted[key] = value.trim();
      }
    }

    const rawStatus = parsed.suggestedLeadStatus;
    const allowed: LeadStatus[] = ["exploring", "interested", "hot", "support"];
    const suggestedLeadStatus =
      typeof rawStatus === "string" && allowed.includes(rawStatus as LeadStatus)
        ? (rawStatus as LeadStatus)
        : null;

    return { reply, extracted, suggestedLeadStatus };
  } catch {
    return { reply, extracted: {}, suggestedLeadStatus: null };
  }
}

const FIELD_WEIGHTS: Record<string, number> = {
  visitorEmail: 20,
  visitorName: 8,
  company: 8,
  website: 8,
  projectType: 12,
  need: 10,
  goal: 8,
  budget: 14,
  urgency: 12,
};

/**
 * Deterministic 0-100 lead score from how much real context has been
 * captured — deliberately NOT driven solely by the model's own judgment,
 * so a chatty-but-uncommitted visitor never outscores a well-identified one.
 */
export function computeLeadScore(conversation: Conversation): number {
  let score = 0;
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    if (conversation[field as keyof Conversation]) score += weight;
  }
  const userMessageCount = conversation.messages.filter((m) => m.role === "user").length;
  score += Math.min(userMessageCount * 2, 10);
  return Math.min(score, 100);
}

/**
 * Combines the deterministic score with the model's suggestion, but the
 * model alone can never mark a lead "hot" — that requires real signal
 * (contact info + budget or urgency together). "client" / "support" are
 * human/administrative states this function never assigns or overrides.
 */
export function deriveLeadStatus(
  conversation: Conversation,
  score: number,
  aiSuggested: LeadStatus | null
): LeadStatus {
  if (conversation.leadStatus === "client" || conversation.leadStatus === "support") {
    return conversation.leadStatus;
  }

  const hasContact = Boolean(conversation.visitorEmail);
  const hasCommitmentSignal = Boolean(conversation.budget) || Boolean(conversation.urgency);

  if (aiSuggested === "hot" && hasContact && hasCommitmentSignal) return "hot";
  if (aiSuggested === "support") return "support";
  if (score >= 40 || hasContact) return "interested";
  if (aiSuggested === "interested" && score >= 15) return "interested";
  return "exploring";
}

/** Summarize once there's enough signal to be useful — not on every turn. */
export function shouldGenerateSummary(conversation: Conversation): boolean {
  const userMessageCount = conversation.messages.filter((m) => m.role === "user").length;
  const hasSubstance = Boolean(conversation.need || conversation.goal || conversation.projectType);
  return userMessageCount >= 3 && hasSubstance;
}
