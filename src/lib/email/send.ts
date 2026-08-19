import "server-only";

/**
 * XAYVEN CORE Phase 3.3 — Communication & Email Operations.
 *
 * The single shared place that talks to Resend's API. Before this phase,
 * the exact same `fetch("https://api.resend.com/emails", ...)` call was
 * written independently three times (contact, maintenance,
 * payments/notify), with small, accidental drift between the copies (e.g.
 * only two of the three ever set `reply_to`). This module is that call,
 * written once — every caller gets the same `from` fallback, the same
 * `to` normalization, and the same error classification, so a fix or a
 * behavior change here can never apply to only some of the three sites.
 *
 * Deliberately returns a discriminated result instead of throwing for the
 * expected failure modes (`not_configured`, `provider_error`) — every
 * caller in this codebase treats "the email didn't send" as a delivery-
 * only failure that must never fail the request it's attached to (see
 * each call site's own doc comments). `unexpected_error` covers a thrown
 * exception from `fetch` itself (network failure, etc.) so callers never
 * need their own try/catch around this.
 */

export interface SendEmailParams {
  /** A single recipient, or several — always normalized to Resend's `to`
   *  array shape internally. */
  to: string | string[];
  subject: string;
  text: string;
  /** Only set when replies should go somewhere other than `from` — e.g.
   *  an admin notification where replying should reach the visitor/client
   *  directly, not `hello@xayven.com` (which is already `from`, so a
   *  reply naturally lands there with no `replyTo` needed). */
  replyTo?: string;
}

export type SendEmailResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" }
  | { ok: false; reason: "provider_error"; status: number; detail: string }
  | { ok: false; reason: "unexpected_error"; detail: string };

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_EMAIL_FROM ?? "XAYVEN <onboarding@resend.dev>";

  if (!apiKey) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(params.to) ? params.to : [params.to],
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
        subject: params.subject,
        text: params.text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, reason: "provider_error", status: res.status, detail };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: "unexpected_error",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
