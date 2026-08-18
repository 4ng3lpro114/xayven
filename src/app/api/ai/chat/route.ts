import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { chatTurnSchema } from "@/lib/validation";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { isAIConfigured, completeChat, type AIMessage } from "@/lib/ai/provider";
import { buildSystemPrompt, type CommercialKnowledge } from "@/lib/ai/knowledge";
import { GET_OFFICIAL_PRICE_TOOL, executeToolCall, type PriceToolContext } from "@/lib/ai/tools";
import { checkNumericGuard } from "@/lib/ai/numericGuard";
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
import { getServiceBySlug, listServices } from "@/lib/db/servicesStore";
import { listPricingCatalogItems } from "@/lib/db/pricingCatalogStore";
import { resolveCommercialMarket, resolveDisplayCurrency } from "@/lib/pricing/commercialContext";
import type { Service } from "@/lib/services/types";
import type { ChatMessage, Conversation } from "@/lib/db/types";
import type { OfficialPriceToolResult } from "@/lib/ai/tools";

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
 * Services Phase 3/6 — same "never trust the client's claim" discipline
 * as resolveActivePromotion() above. A nonexistent or unpublished slug
 * resolves to `null`, indistinguishable from "no serviceSlug was sent at
 * all" — never produces a false attribution. Returns the full Service
 * (not just the slug) since Phase 6 also uses this to inject the
 * "CURRENT SERVICE PAGE" block into the prompt — one resolution function,
 * two callers (attribution + knowledge), never two separate lookups.
 */
async function resolveActiveService(serviceSlug: string | undefined): Promise<Service | null> {
  if (!serviceSlug) return null;
  const service = await getServiceBySlug(serviceSlug);
  if (!service || !service.isPublished) return null;
  return service;
}

type ChatTurnOutcome =
  | { ok: true; content: string; authorizedAmounts: number[] }
  | { ok: false; reason: "not_configured" | "request_failed"; detail?: string };

/**
 * International Pricing Phase E — XAYVEN AI. Runs one full turn against
 * the provider, including AT MOST ONE round of tool calls for
 * get_official_price — not an open-ended agent loop. The second
 * completion (only made if the first asked for a tool) is called WITHOUT
 * `tools`, so the model cannot request a further tool call even if it
 * wanted to; it must answer in prose once the tool result is in front of
 * it. `toolContext.market`/`toolContext.displayCurrency` are resolved by
 * the caller BEFORE this runs and never change during it — the model has
 * no way to influence either, since the tool's own parameters (see
 * lib/ai/tools.ts) don't accept them at all.
 *
 * Returns `authorizedAmounts` — every officialAmount/displayAmount an
 * executed tool call actually returned this turn — for the numeric guard
 * (CAPA 2, see lib/ai/numericGuard.ts) to check the final reply against.
 */
async function runChatTurn(messages: AIMessage[], toolContext: PriceToolContext): Promise<ChatTurnOutcome> {
  const first = await completeChat(messages, { tools: [GET_OFFICIAL_PRICE_TOOL] });
  if (!first.ok) return first;

  if (!first.toolCalls || first.toolCalls.length === 0) {
    if (!first.content) return { ok: false, reason: "request_failed", detail: "empty_response" };
    return { ok: true, content: first.content, authorizedAmounts: [] };
  }

  const toolResults = await Promise.all(
    first.toolCalls.map(async (toolCall) => ({
      toolCall,
      resultJson: await executeToolCall(toolCall, toolContext),
    }))
  );

  const authorizedAmounts: number[] = [];
  for (const { resultJson } of toolResults) {
    try {
      const parsed = JSON.parse(resultJson) as Partial<OfficialPriceToolResult>;
      if (typeof parsed.officialAmount === "number") authorizedAmounts.push(parsed.officialAmount);
      if (typeof parsed.displayAmount === "number") authorizedAmounts.push(parsed.displayAmount);
    } catch {
      // executeToolCall() always returns valid JSON — this is defensive
      // only, never expected to actually trigger.
    }
  }

  const followUpMessages: AIMessage[] = [
    ...messages,
    { role: "assistant", content: first.content, tool_calls: first.toolCalls },
    ...toolResults.map(({ toolCall, resultJson }) => ({
      role: "tool" as const,
      content: resultJson,
      tool_call_id: toolCall.id,
    })),
  ];

  const second = await completeChat(followUpMessages);
  if (!second.ok) return second;
  if (!second.content) return { ok: false, reason: "request_failed", detail: "empty_response" };

  return { ok: true, content: second.content, authorizedAmounts };
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

  const { sessionId, message, locale: rawLocale, promotionId, serviceSlug } = parsed.data;
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

  // Services Phase 3 — same first-touch, sticky attribution rule as
  // promotionId above, independent field (a conversation could in theory
  // carry both if the visitor somehow triggered both handoffs, though
  // ChatWidget only ever fires one per open). Re-validated here, not
  // trusted from the client.
  if (serviceSlug && !conversation.servicePageSlug) {
    const attributed = await resolveActiveService(serviceSlug);
    if (attributed) {
      conversation = { ...conversation, servicePageSlug: attributed.slug };
    }
  }

  // Re-resolved on EVERY turn (not cached from the attribution step above)
  // so the model only ever gets shown a promotion/service that's still
  // genuinely active/published right now — one attributed on turn 1 that
  // got paused/unpublished before turn 3 simply stops appearing in the
  // prompt from then on, while conversation.promotionId/servicePageSlug
  // themselves (the historical fact of where this lead came from, for
  // Analytics) are never touched.
  const activePromotion = await resolveActivePromotion(conversation.promotionId ?? undefined);
  const activeService = await resolveActiveService(conversation.servicePageSlug ?? undefined);

  // Services Phase 6 — real commercial data, fetched once per turn and
  // handed to buildSystemPrompt() the same way activePromotion already
  // is. Published services / active catalog items only — never leaks a
  // draft/inactive item into what the model can state as fact.
  const [services, packages] = await Promise.all([
    listServices({ publishedOnly: true }),
    listPricingCatalogItems({ activeOnly: true }),
  ]);
  const commercial: CommercialKnowledge = { services, packages, activeService };

  const systemPrompt = buildSystemPrompt(dict, locale, activePromotion, commercial);
  const history: AIMessage[] = conversation.messages.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // International Pricing Phase E — resolved ONCE per turn, BEFORE the
  // model is ever called, exactly like `market` already is for Services/
  // Maintenance (see commercialContext.ts). The model never sees this
  // resolution happen and never receives market/displayCurrency as
  // something it can choose — only get_official_price's *result* reflects
  // them (see lib/ai/tools.ts).
  const { market } = await resolveCommercialMarket();
  const { currency: displayCurrency } = await resolveDisplayCurrency(market);
  const toolContext: PriceToolContext = { market, displayCurrency, locale };

  const outcome = await runChatTurn([{ role: "system", content: systemPrompt }, ...history], toolContext);

  if (!outcome.ok) {
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
    const status = outcome.reason === "not_configured" ? 503 : 502;
    return NextResponse.json({ ok: false, error: outcome.reason }, { status });
  }

  const { reply, extracted, suggestedLeadStatus } = parseAIResponse(outcome.content);

  // International Pricing Phase E — CAPA 2, anti-hallucination post-hoc
  // check (see lib/ai/numericGuard.ts). Detection/logging only — never
  // blocks, edits, or replaces the reply. `outcome.authorizedAmounts` is
  // empty when no tool was called this turn, so ANY price-like number in
  // a no-tool reply is flagged — exactly the "answered with a price
  // without calling the tool" case CAPA 1 is supposed to prevent. `message`
  // (the visitor's own text this turn) is passed so a number the model is
  // only echoing back from the visitor (a stated budget, a quantity) isn't
  // flagged as an unverified XAYVEN price — see numericGuard.ts's doc.
  const numericGuard = checkNumericGuard(reply, outcome.authorizedAmounts, message);
  if (numericGuard.flagged) {
    console.warn("[ai/chat] numeric guard flagged possible unverified price(s) in AI reply", {
      sessionId,
      suspiciousMatches: numericGuard.suspiciousMatches,
    });
  }

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
