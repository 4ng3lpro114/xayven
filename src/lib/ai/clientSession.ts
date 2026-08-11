"use client";

const STORAGE_KEY = "xayven_chat_session_id";

/**
 * Returns a stable, non-guessable id for the current browser, creating one
 * on first use. Used only to group chat turns into a conversation — it is
 * not an auth token and grants no access to anything.
 */
export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "")
        : Math.random().toString(36).slice(2) + Date.now().toString(36);

    window.localStorage.setItem(STORAGE_KEY, id);
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
