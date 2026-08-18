import "server-only";
import { completeChat } from "@/lib/ai/provider";
import type { Conversation } from "@/lib/db/types";

/**
 * Produces a short, sales-facing summary of a conversation — the kind of
 * thing someone on the XAYVEN team should be able to read in five seconds
 * before following up. Uses a separate, narrowly-scoped AI call (not the
 * conversational one) so it can't be steered by anything in the chat.
 */
export async function generateSummary(conversation: Conversation): Promise<string | null> {
  const transcript = conversation.messages
    .map((m) => `${m.role === "user" ? "Visitor" : "XAYVEN AI"}: ${m.content}`)
    .join("\n");

  const known = [
    conversation.projectType && `Project type: ${conversation.projectType}`,
    conversation.need && `Need: ${conversation.need}`,
    conversation.goal && `Goal: ${conversation.goal}`,
    conversation.budget && `Budget: ${conversation.budget}`,
    conversation.urgency && `Urgency: ${conversation.urgency}`,
    conversation.website && `Existing website: ${conversation.website}`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await completeChat(
    [
      {
        role: "system",
        content:
          "You write short, plain-language internal sales summaries from a chat transcript between a visitor and XAYVEN AI, a web studio's assistant. 2-4 sentences, no headers, no bullet points, no invented facts — only what's actually in the transcript or the known-fields list. Write in the same language as the transcript.",
      },
      {
        role: "user",
        content: `Known fields:\n${known || "(none yet)"}\n\nTranscript:\n${transcript}`,
      },
    ],
    { temperature: 0.2, maxTokens: 200 }
  );

  // No tools are ever passed here, so a real toolCalls response is not a
  // case this call site can produce — but the type is shared with the
  // tool-calling path (see provider.ts), so content is still `string |
  // null` at the type level.
  return result.ok && result.content ? result.content.trim() : null;
}
