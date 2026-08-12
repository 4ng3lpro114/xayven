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

export const OPEN_CHAT_EVENT = "xayven:open-chat";

/** Lets any component (e.g. the diagnosis tool) open the chat widget
 *  without prop-drilling — ChatWidget listens for this on `window`. */
export function openChatWidget() {
  window.dispatchEvent(new Event(OPEN_CHAT_EVENT));
}
