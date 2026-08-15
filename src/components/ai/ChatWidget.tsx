"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X, Send, Loader2, RotateCcw } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { WhatsAppButton } from "@/components/whatsapp/WhatsAppButton";
import { ChatMessageBubble, ChatThinkingBubble, type UIMessage } from "@/components/ai/ChatMessageBubble";
import {
  getOrCreateSessionId,
  consumeDiagnosisContext,
  consumePromotionContext,
  OPEN_CHAT_EVENT,
} from "@/lib/ai/clientSession";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/config";

type Configured = "checking" | "yes" | "no";
type TurnError = null | "rate_limited" | "upstream_error";

interface ChatWidgetProps {
  dict: Dictionary["ai"];
  locale: Locale;
  privacyHref: string;
  whatsappNumber: string | null;
  whatsappLabel: string;
  whatsappMessage: string;
}

export function ChatWidget({
  dict,
  locale,
  privacyHref,
  whatsappNumber,
  whatsappLabel,
  whatsappMessage,
}: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<Configured>("checking");
  const [messages, setMessages] = useState<UIMessage[]>(() => [
    { role: "assistant", content: dict.greeting },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnError, setTurnError] = useState<TurnError>(null);
  const sessionIdRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const diagnosisHandled = useRef(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const openHandler = () => setOpen(true);
    window.addEventListener(OPEN_CHAT_EVENT, openHandler);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, openHandler);
  }, []);

  useEffect(() => {
    // Re-runs on locale change (e.g. switching /es <-> /en client-side,
    // without a full page reload) so the session id — and therefore the
    // conversation it groups turns into — is always the one scoped to the
    // language currently being viewed. See clientSession.ts.
    sessionIdRef.current = getOrCreateSessionId(locale);
    fetch("/api/ai/chat")
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((data: { configured?: boolean }) => setConfigured(data.configured ? "yes" : "no"))
      .catch(() => setConfigured("no"));
  }, [locale]);

  useEffect(() => {
    if (!open) return;
    if (!diagnosisHandled.current) {
      diagnosisHandled.current = true;
      // Fase 11 Etapa A: checked first — in practice a visitor only ever
      // triggers one handoff (promotion CTA OR the diagnosis tool) before
      // opening the chat, never both, but the two live in separate
      // sessionStorage keys (see clientSession.ts) so checking one never
      // has to know about the other's shape.
      const promotionContext = consumePromotionContext();
      if (promotionContext) {
        window.setTimeout(
          () => void sendMessage(promotionContext.message, promotionContext.promotionId),
          400
        );
        return;
      }
      const context = consumeDiagnosisContext();
      if (context) {
        // Small delay so the greeting renders first, then the handoff
        // message appears as if the visitor sent it right after opening.
        window.setTimeout(() => void sendMessage(context), 400);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text: string, promotionId?: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setTurnError(null);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          message: trimmed,
          locale,
          // Only ever present on the one auto-sent turn right after
          // opening via a promotion's CTA — every regular typed message
          // (including the rest of this same conversation) omits it
          // entirely, since attribution only needs to happen once (see
          // /api/ai/chat/route.ts's "first-touch, sticky" comment).
          ...(promotionId ? { promotionId } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reply?: string;
        error?: string;
      };

      if (res.ok && data.ok && data.reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply! }]);
      } else if (res.status === 429) {
        setTurnError("rate_limited");
      } else {
        setTurnError("upstream_error");
      }
    } catch {
      setTurnError("upstream_error");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  function restart() {
    setMessages([{ role: "assistant", content: dict.greeting }]);
    setTurnError(null);
    sessionIdRef.current = getOrCreateSessionId(locale);
  }

  const showSuggestions = messages.length <= 1 && !loading;

  return (
    <>
      <WhatsAppButton
        phoneNumber={whatsappNumber}
        message={whatsappMessage}
        label={whatsappLabel}
        visible={!open}
      />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? dict.closeLabel : dict.openLabel}
        aria-expanded={open}
        className={cn(
          "fixed right-5 z-50 flex size-14 items-center justify-center rounded-full border border-border-accent bg-bg-elevated shadow-glow-md transition-transform duration-200 hover:scale-105 sm:right-6",
          open && "scale-95"
        )}
        style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {open ? (
          <X className="size-5 text-fg" aria-hidden="true" />
        ) : (
          <>
            <Logo markOnly className="scale-125" />
            <span
              className={cn(
                "absolute right-1 top-1 size-2.5 rounded-full border-2 border-bg-elevated",
                configured === "yes" ? "bg-success" : "bg-fg-subtle"
              )}
              aria-hidden="true"
            />
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={dict.name}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "fixed inset-0 z-50 flex flex-col bg-bg-raised",
              "sm:inset-auto sm:right-6 sm:bottom-24 sm:h-[36rem] sm:w-[23.75rem] sm:rounded-xl sm:border sm:border-border-strong sm:shadow-elevated"
            )}
            style={{
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
              paddingTop: "env(safe-area-inset-top, 0px)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:rounded-t-xl">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-full border border-border-strong bg-bg-elevated">
                  <Logo markOnly />
                </span>
                <div>
                  <p className="text-sm font-semibold text-fg">{dict.name}</p>
                  <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        configured === "yes" ? "bg-success" : "bg-fg-subtle"
                      )}
                    />
                    {dict.availability}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={restart}
                  aria-label={dict.restart}
                  className="inline-flex size-8 items-center justify-center rounded-md text-fg-subtle transition-colors hover:text-fg"
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={dict.closeLabel}
                  className="inline-flex size-8 items-center justify-center rounded-md text-fg-subtle transition-colors hover:text-fg sm:hidden"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {configured === "no" ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm font-semibold text-fg">{dict.notConfiguredTitle}</p>
                <p className="text-sm text-fg-muted">{dict.notConfiguredBody}</p>
              </div>
            ) : (
              <>
                {/* Messages */}
                <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                  {messages.map((m, i) => (
                    <ChatMessageBubble key={i} message={m} />
                  ))}
                  {loading && <ChatThinkingBubble />}

                  {turnError && (
                    <p className="text-center text-xs text-error">
                      {turnError === "rate_limited" ? dict.rateLimitedBody : dict.errorBody}
                    </p>
                  )}

                  {showSuggestions && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {dict.suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => void sendMessage(s)}
                          className="rounded-pill border border-border-strong bg-bg-elevated px-3 py-1.5 text-xs text-fg-muted transition-colors hover:border-border-accent hover:text-fg"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Composer */}
                <div className="border-t border-border px-4 py-3">
                  <p className="mb-2 text-[0.7rem] leading-snug text-fg-subtle">
                    {dict.consentNotice}
                    <a href={privacyHref} className="underline hover:text-fg-muted">
                      {dict.consentPrivacyLink}
                    </a>
                    .
                  </p>
                  <form onSubmit={handleSubmit} className="flex items-end gap-2">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void sendMessage(input);
                        }
                      }}
                      placeholder={dict.inputPlaceholder}
                      rows={1}
                      disabled={loading}
                      className="max-h-24 flex-1 resize-none rounded-md border border-border-strong bg-bg-elevated px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle focus:border-accent-400 focus:outline-none disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      disabled={loading || !input.trim()}
                      aria-label={dict.sendLabel}
                      className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-500 text-white transition-colors hover:bg-accent-400 disabled:opacity-40"
                    >
                      {loading ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Send className="size-4" aria-hidden="true" />
                      )}
                    </button>
                  </form>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
