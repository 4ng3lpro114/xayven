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
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale } from "@/lib/i18n/config";
import type { ChatMessage } from "@/lib/db/types";

export const runtime = "nodejs";

const MAX_HISTORY_MESSAGES = 16; // sent to the model, oldest trimmed first
const MAX_STORED_MESSAGES = 60; // hard cap on what a conversation keeps

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

  const { sessionId, message, locale: rawLocale } = parsed.data;
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

  const systemPrompt = buildSystemPrompt(dict, locale);
  const history: AIMessage[] = conversation.messages.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const result = await completeChat([{ role: "system", content: systemPrompt }, ...history]);

  if (!result.ok) {
    // Never lose the visitor's message even if the model call failed.
    await saveConversation(conversation);
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
  conversation.leadStatus = deriveLeadStatus(conversation, conversation.leadScore, suggestedLeadStatus);

  if (shouldGenerateSummary(conversation)) {
    const summary = await generateSummary(conversation);
    if (summary) conversation.aiSummary = summary;
  }

  const saved = await saveConversation(conversation);

  return NextResponse.json({
    ok: true,
    reply,
    conversationId: saved.id,
    leadStatus: saved.leadStatus,
  });
}
