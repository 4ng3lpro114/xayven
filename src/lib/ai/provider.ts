import "server-only";

/**
 * Thin, provider-agnostic AI client. Talks to any OpenAI-compatible
 * `/chat/completions` endpoint via plain `fetch` — no SDK dependency, so
 * swapping providers later (Groq, Together, a self-hosted model, Azure
 * OpenAI, …) only means changing AI_BASE_URL / AI_MODEL, not this file's
 * shape. The API key never leaves the server.
 *
 * International Pricing Phase E — XAYVEN AI: extended with tool/function
 * calling support (OpenAI's `tools`/`tool_calls`/`role:"tool"` contract).
 * Verified before this was written: this project's environment has no
 * AI_BASE_URL/AI_MODEL override configured, so the defaults below
 * (`api.openai.com`, `gpt-4o-mini`) are what's actually in use — real
 * OpenAI, the reference implementation of this exact request/response
 * shape, not an assumed-compatible third party. If AI_BASE_URL is ever
 * pointed at a different provider, its support for `tools`/`tool_calls`
 * should be re-verified before relying on Phase E's tool-calling round
 * trip — this file makes no attempt to detect or work around a provider
 * that only speaks plain chat completions.
 */

export interface AIMessage {
  role: "system" | "user" | "assistant" | "tool";
  /** Null only ever appears on an assistant message that carries
   *  `tool_calls` instead of a natural-language reply — the OpenAI
   *  contract's own convention, not something this file invents. */
  content: string | null;
  /** Only meaningful on role:"assistant" — the tool call(s) that
   *  message asked for, echoed back verbatim when replaying it as
   *  history for the follow-up completion (see route.ts's round trip). */
  tool_calls?: AIToolCall[];
  /** Only meaningful on role:"tool" — which tool_call this result
   *  answers, per OpenAI's contract. */
  tool_call_id?: string;
}

/** One tool the model may call, declared in OpenAI's `tools` shape.
 *  `parameters` is a JSON Schema object — kept as `Record<string,
 *  unknown>` here (not a Zod schema) because this is the literal wire
 *  shape sent to the provider, not a validation layer; the actual
 *  argument validation happens where the tool call is executed (see
 *  lib/ai/tools.ts), never trusted from the model alone. */
export interface AITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** One tool call the model is requesting — `arguments` is a JSON string
 *  (the model's own output), not yet parsed/validated here. */
export interface AIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type AICompletionResult =
  | { ok: true; content: string | null; toolCalls?: AIToolCall[] }
  | { ok: false; reason: "not_configured" | "request_failed"; detail?: string };

export function isAIConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY);
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

export async function completeChat(
  messages: AIMessage[],
  options?: { temperature?: number; maxTokens?: number; tools?: AITool[] }
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
        ...(options?.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      return { ok: false, reason: "request_failed", detail };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: AIToolCall[] } }[];
    };
    const message = json.choices?.[0]?.message;
    const toolCalls = message?.tool_calls;

    if (toolCalls && toolCalls.length > 0) {
      return { ok: true, content: message?.content ?? null, toolCalls };
    }

    const content = message?.content;
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
