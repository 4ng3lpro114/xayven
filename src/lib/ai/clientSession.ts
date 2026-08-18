"use client";

const STORAGE_KEY = "xayven_chat_session_id";

/**
 * Returns a stable, non-guessable id for the current browser + locale,
 * creating one on first use. Used only to group chat turns into a
 * conversation — it is not an auth token and grants no access to anything.
 *
 * Scoped per locale (separate localStorage key per language) so a visitor
 * switching between /es and /en starts an independent conversation for
 * each — otherwise the server-side history for one language would get
 * built into the model's context while replying in the other, biasing it
 * toward whichever language the conversation started in regardless of the
 * current page's locale. Neither language's history is ever deleted —
 * this only changes which key the browser looks up.
 */
export function getOrCreateSessionId(locale: string): string {
  if (typeof window === "undefined") return "";

  const storageKey = `${STORAGE_KEY}:${locale}`;

  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "")
        : Math.random().toString(36).slice(2) + Date.now().toString(36);

    window.localStorage.setItem(storageKey, id);
    return id;
  } catch {
    // Storage unavailable (private mode, etc.) — fall back to an
    // in-memory-only id for this page load.
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

const DIAGNOSIS_CONTEXT_KEY = "xayven_diagnosis_context";

export function setDiagnosisContext(text: string) {
  try {
    window.sessionStorage.setItem(DIAGNOSIS_CONTEXT_KEY, text);
  } catch {
    // Ignore — diagnosis handoff is a nice-to-have, not critical.
  }
}

export function consumeDiagnosisContext(): string | null {
  try {
    const value = window.sessionStorage.getItem(DIAGNOSIS_CONTEXT_KEY);
    if (value) window.sessionStorage.removeItem(DIAGNOSIS_CONTEXT_KEY);
    return value;
  } catch {
    return null;
  }
}

const PROMOTION_CONTEXT_KEY = "xayven_promotion_context";

export interface PromotionContext {
  promotionId: string;
  /** The first message ChatWidget auto-sends on the visitor's behalf —
   *  same role `computeDiagnosisResult()`'s context text plays for
   *  setDiagnosisContext() above, just sourced from the promotion's own
   *  `ctaMessage`/`text` instead (see PromotionCtaButton.tsx). */
  message: string;
}

/** Same one-shot sessionStorage handoff as setDiagnosisContext()/
 *  consumeDiagnosisContext() above — a SEPARATE key, not reusing the
 *  diagnosis one, since the two contexts carry different shapes (this one
 *  needs the promotion id alongside the message, for real attribution —
 *  see ChatWidget.tsx and /api/ai/chat/route.ts). Never both set at once
 *  in practice (only one CTA is ever clicked before opening the chat),
 *  but kept as two independent keys regardless so neither handoff can
 *  accidentally clobber the other. */
export function setPromotionContext(context: PromotionContext) {
  try {
    window.sessionStorage.setItem(PROMOTION_CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // Ignore — same "nice-to-have, not critical" reasoning as
    // setDiagnosisContext() above; the promotion is still visible on the
    // page even if this handoff silently fails.
  }
}

export function consumePromotionContext(): PromotionContext | null {
  try {
    const raw = window.sessionStorage.getItem(PROMOTION_CONTEXT_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(PROMOTION_CONTEXT_KEY);
    const parsed = JSON.parse(raw) as Partial<PromotionContext>;
    if (typeof parsed.promotionId !== "string" || typeof parsed.message !== "string") return null;
    return { promotionId: parsed.promotionId, message: parsed.message };
  } catch {
    return null;
  }
}

const SERVICE_CONTEXT_KEY = "xayven_service_context";

export interface ServiceContext {
  /** The service's slug (/services/[slug]) — for server-side attribution
   *  (see chatTurnSchema.serviceSlug and /api/ai/chat/route.ts), never
   *  shown to the visitor directly. */
  slug: string;
  /** The first message ChatWidget auto-sends on the visitor's behalf —
   *  same role setDiagnosisContext()'s text and PromotionContext.message
   *  play above, sourced from the service detail page's own AI CTA (see
   *  ServiceAiCtaButton.tsx). */
  message: string;
}

/** Same one-shot sessionStorage handoff as setDiagnosisContext()/
 *  setPromotionContext() above — a THIRD independent key, not reusing
 *  either (each context carries a different shape and a different
 *  meaning). Never more than one of the three is ever set in practice
 *  (only one CTA is clicked before opening the chat), but kept
 *  independent regardless so none can accidentally clobber another. */
export function setServiceContext(context: ServiceContext) {
  try {
    window.sessionStorage.setItem(SERVICE_CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // Ignore — same "nice-to-have, not critical" reasoning as the other
    // two context setters above.
  }
}

export function consumeServiceContext(): ServiceContext | null {
  try {
    const raw = window.sessionStorage.getItem(SERVICE_CONTEXT_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(SERVICE_CONTEXT_KEY);
    const parsed = JSON.parse(raw) as Partial<ServiceContext>;
    if (typeof parsed.slug !== "string" || typeof parsed.message !== "string") return null;
    return { slug: parsed.slug, message: parsed.message };
  } catch {
    return null;
  }
}

export const OPEN_CHAT_EVENT = "xayven:open-chat";

/** Lets any component (e.g. the diagnosis tool) open the chat widget
 *  without prop-drilling — ChatWidget listens for this on `window`. */
export function openChatWidget() {
  window.dispatchEvent(new Event(OPEN_CHAT_EVENT));
}
