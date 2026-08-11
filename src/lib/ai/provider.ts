import "server-only";

/**
 * Thin, provider-agnostic AI client. Talks to any OpenAI-compatible
 * `/chat/completions` endpoint via plain `fetch` — no SDK dependency, so
 * swapping providers later (Groq, Together, a self-hosted model, Azure
 * OpenAI, …) only means changing AI_BASE_URL / AI_MODEL, not this file's
 * shape. The API key never leaves the server.
 */

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type AICompletionResult =
  | { ok: true; content: string }
  | { ok: false; reason: "not_configured" | "request_failed"; detail?: string };

export function isAIConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY);
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

export async function completeChat(
  messages: AIMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<AICompletionResult> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return { ok: false, reason: "not_configured" };

  const baseUrl = (process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.AI_MODEL || DEFAULT_MODEL;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.4,
        max_tokens: options?.maxTokens ?? 500,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      return { ok: false, reason: "request_failed", detail };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;

    if (typeof content !== "string" || content.trim().length === 0) {
      return { ok: false, reason: "request_failed", detail: "empty_response" };
    }

    return { ok: true, content };
  } catch (error) {
    return {
      ok: false,
      reason: "request_failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
