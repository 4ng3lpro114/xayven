import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { chatTurnSchema } from "@/lib/validation";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { isAIConfigured, completeChat, type AIMessage } from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/ai/knowledge";
import {
  computeLeadScore,
  deriveLeadStatus,
  parseAIResponse,
  shouldGenerateSummary,
} from "@/lib/ai/conversation";
import { generateSummary } from "@/lib/ai/summary";
import {
  applyExtractedFields,
  getOrCreateConversation,
  saveConversation,
} from "@/lib/db/conversationStore";
import { changeLeadStatus } from "@/lib/leads/leadStatus";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale } from "@/lib/i18n/config";
import { getPromotionById } from "@/lib/db/promotionStore";
import { getEffectivePromotionStatus } from "@/lib/promotions/effectiveStatus";
import { toPublicPromotion } from "@/lib/promotions/eligibility";
import type { PublicPromotion } from "@/lib/promotions/types";
import type { ChatMessage, Conversation } from "@/lib/db/types";

export const runtime = "nodejs";

const MAX_HISTORY_MESSAGES = 16; // sent to the model, oldest trimmed first
const MAX_STORED_MESSAGES = 60; // hard cap on what a conversation keeps

/**
 * Fase 11 Etapa A — the ONLY place a promotion is ever treated as
 * "currently active" for chat purposes. Never trusts the client's claim
 * that a promotionId is valid/active — always re-fetches the real row and
 * recomputes getEffectivePromotionStatus() itself (the same canonical
 * function the admin UI and getEligibleActivePromotions() already use,
 * never a second status calculation). A nonexistent, draft, scheduled,
 * paused, expired, or archived promotion all resolve to `null` here —
 * indistinguishable from "no promotion id was sent at all" to every
 * caller, which is exactly the point: it can never produce a false
 * attribution or leak into the prompt as if it were real.
 */
async function resolveActivePromotion(promotionId: string | undefined): Promise<PublicPromotion | null> {
  if (!promotionId) return null;
  const promotion = await getPromotionById(promotionId);
  if (!promotion) return null;
  if (getEffectivePromotionStatus(promotion, new Date()) !== "active") return null;
  return toPublicPromotion(promotion);
}

/**
 * GET — lets the widget check whether XAYVEN AI is configured before
 * rendering the chat UI, instead of burning a turn to find out.
 */
export function GET() {
  return NextResponse.json({ configured: isAIConfigured() });
}

/**
 * POST — one visitor turn: validate, rate-limit, load conversation context,
 * call the AI provider, extract/score/persist, reply.
 */
export async function POST(request: NextRequest) {
  if (!isAIConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = chatTurnSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  const { sessionId, message, locale: rawLocale, promotionId } = parsed.data;
  const locale = hasLocale(rawLocale) ? rawLocale : "es";

  const ip = getClientIp(request);
  const ipLimit = rateLimit(`ai-chat:ip:${ip}`, { limit: 40, windowMs: 10 * 60 * 1000 });
  const sessionLimit = rateLimit(`ai-chat:session:${sessionId}`, {
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });

  if (!ipLimit.allowed || !sessionLimit.allowed) {
    const retryAfter = Math.max(ipLimit.retryAfterSeconds, sessionLimit.retryAfterSeconds);
    return NextResponse.json(
      { ok: false, error: "rate_limited", retryAfterSeconds: retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const dict = await getDictionary(locale);
  let conversation = await getOrCreateConversation(sessionId, locale);

  const userMessage: ChatMessage = {
    role: "user",
    content: message,
    createdAt: new Date().toISOString(),
  };
  conversation = {
    ...conversation,
    messages: [...conversation.messages, userMessage].slice(-MAX_STORED_MESSAGES),
    // Sending a message alongside the always-visible privacy notice in the
    // widget is treated as consent to store the conversation — see /privacy.
    consentStatus: conversation.consentStatus === "declined" ? "declined" : "granted",
  };

  // Fase 11 Etapa A — first-touch, sticky attribution: only ever set once
  // per conversation, on the turn where the widget was opened via a
  // promotion's CTA (see ChatWidget.tsx's consumePromotionContext()). A
  // later message never overwrites an already-attributed conversation,
  // even if it happens to carry a (different) promotionId — matches
  // clientId/convertedAt's own "set once" discipline on this same table.
  if (promotionId && !conversation.promotionId) {
    const attributed = await resolveActivePromotion(promotionId);
    if (attributed) {
      conversation = { ...conversation, promotionId: attributed.id };
    }
  }

  // Re-resolved on EVERY turn (not cached from the attribution step above)
  // so the model only ever gets shown a promotion that's still genuinely
  // active right now — a promotion attributed on turn 1 that got paused/
  // archived before turn 3 simply stops appearing in the prompt from then
  // on, while conversation.promotionId itself (the historical fact of
  // where this lead came from, for Analytics) is never touched.
  const activePromotion = await resolveActivePromotion(conversation.promotionId ?? undefined);

  const systemPrompt = buildSystemPrompt(dict, locale, activePromotion);
  const history: AIMessage[] = conversation.messages.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const result = await completeChat([{ role: "system", content: systemPrompt }, ...history]);

  if (!result.ok) {
    // Never lose the visitor's message even if the model call failed —
    // but this is a best-effort side write, not load-bearing for the
    // response below (which is already reporting the AI failure, the
    // real reason for this turn's error). Fase 9C: saveConversation() can
    // now throw (e.g. the conversation was deleted mid-turn) — log it and
    // still return the AI-failure response the visitor actually needs,
    // rather than crashing with an unrelated, less useful error.
    try {
      await saveConversation(conversation);
    } catch (error) {
      console.error("[ai/chat] Failed to persist conversation after a failed AI call:", error);
    }
    const status = result.reason === "not_configured" ? 503 : 502;
    return NextResponse.json({ ok: false, error: result.reason }, { status });
  }

  const { reply, extracted, suggestedLeadStatus } = parseAIResponse(result.content);

  conversation = applyExtractedFields(conversation, extracted);
  conversation.messages = [
    ...conversation.messages,
    { role: "assistant", content: reply, createdAt: new Date().toISOString() } satisfies ChatMessage,
  ].slice(-MAX_STORED_MESSAGES);

  conversation.leadScore = computeLeadScore(conversation);
  // Fase 9C: computed here, but NEVER assigned onto `conversation` directly
  // — leadStatus only ever changes through changeLeadStatus() below, the
  // single sanctioned write-point for the whole codebase. deriveLeadStatus
  // reads conversation.leadStatus internally for its "already client/
  // support, stay sticky" rule, so it must still see the CURRENT value
  // here, unmodified.
  const suggestedStatus = deriveLeadStatus(conversation, conversation.leadScore, suggestedLeadStatus);

  if (shouldGenerateSummary(conversation)) {
    const summary = await generateSummary(conversation);
    if (summary) conversation.aiSummary = summary;
  }

  // Persist everything from this turn (messages, score, extracted fields,
  // summary) with leadStatus untouched — then apply the status transition
  // (if any) through the centralized function, which no-ops (no write, no
  // history row) on the common case where the status didn't actually
  // change. deriveLeadStatus() can never produce "client" from a
  // non-client conversation (it only ever echoes an already-"client"
  // status back, sticky) — so this call can never hit
  // changeLeadStatus()'s "client requires lead_conversion" guard in
  // practice, but the guard exists regardless, as defense in depth.
  let saved: Conversation;
  try {
    saved = await saveConversation(conversation);
    const statusResult = await changeLeadStatus({
      conversation: saved,
      newStatus: suggestedStatus,
      changedBy: "ai",
      source: "ai_chat_turn",
    });
    saved = statusResult.conversation;
  } catch (error) {
    // Fase 9C: saveConversation() now throws instead of silently
    // "succeeding" when the conversation row is gone (e.g. deleted via
    // /api/admin/conversations/[id] in the narrow window between this
    // turn's start and this write) — same discipline as every other write
    // route in this codebase: a controlled, logged failure, never a
    // fabricated ok:true carrying a leadStatus that was never persisted.
    console.error("[ai/chat] Failed to persist conversation turn:", error);
    return NextResponse.json({ ok: false, error: "chat_turn_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    reply,
    conversationId: saved.id,
    leadStatus: saved.leadStatus,
  });
}
