import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * vitest.config.mts runs in a plain "node" environment (no jsdom, no
 * `window`) — same constraint documented in
 * src/components/admin/__tests__/ConversationActions.test.ts. A minimal
 * fake `window` (just sessionStorage + dispatchEvent/addEventListener,
 * the only three APIs setPromotionContext/consumePromotionContext/
 * openChatWidget actually touch) is stubbed in per-test via
 * vi.stubGlobal("window", ...) — the same `vi.stubGlobal` technique this
 * codebase already uses everywhere for `fetch`, just applied to `window`
 * instead. This tests the real sessionStorage read/write/JSON round-trip
 * logic, not DOM rendering or click simulation — that gap (does clicking
 * the real button in a real browser call these functions) stays
 * undocumented-by-automated-test, same as ConversationActions'.
 */

function makeFakeWindow() {
  const store = new Map<string, string>();
  return {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("setPromotionContext / consumePromotionContext (Fase 11 Etapa A)", () => {
  it("G. round-trip completo — lo que se guarda es exactamente lo que se consume", async () => {
    vi.stubGlobal("window", makeFakeWindow());
    const { setPromotionContext, consumePromotionContext } = await import("../clientSession");

    setPromotionContext({ promotionId: "promo-1", message: "Quiero la promo de agosto" });
    const result = consumePromotionContext();

    expect(result).toEqual({ promotionId: "promo-1", message: "Quiero la promo de agosto" });
  });

  it("consumir es de un solo uso — la segunda llamada devuelve null", async () => {
    vi.stubGlobal("window", makeFakeWindow());
    const { setPromotionContext, consumePromotionContext } = await import("../clientSession");

    setPromotionContext({ promotionId: "promo-1", message: "Hola" });
    consumePromotionContext();
    const second = consumePromotionContext();

    expect(second).toBeNull();
  });

  it("nada guardado → null, nunca lanza", async () => {
    vi.stubGlobal("window", makeFakeWindow());
    const { consumePromotionContext } = await import("../clientSession");

    expect(consumePromotionContext()).toBeNull();
  });

  it("JSON corrupto en sessionStorage → null, nunca lanza (defensivo, nunca confía en el storage)", async () => {
    const fakeWindow = makeFakeWindow();
    fakeWindow.sessionStorage.setItem("xayven_promotion_context", "{not valid json");
    vi.stubGlobal("window", fakeWindow);
    const { consumePromotionContext } = await import("../clientSession");

    expect(consumePromotionContext()).toBeNull();
  });

  it("forma inesperada (falta promotionId o message) → null, nunca un objeto a medias", async () => {
    const fakeWindow = makeFakeWindow();
    fakeWindow.sessionStorage.setItem("xayven_promotion_context", JSON.stringify({ promotionId: "promo-1" }));
    vi.stubGlobal("window", fakeWindow);
    const { consumePromotionContext } = await import("../clientSession");

    expect(consumePromotionContext()).toBeNull();
  });

  it("no usa la misma clave que setDiagnosisContext — los dos handoffs nunca se pisan", async () => {
    vi.stubGlobal("window", makeFakeWindow());
    const { setPromotionContext, consumePromotionContext } = await import("../clientSession");
    const { setDiagnosisContext, consumeDiagnosisContext } = await import("../clientSession");

    setDiagnosisContext("contexto de diagnóstico");
    setPromotionContext({ promotionId: "promo-1", message: "contexto de promoción" });

    expect(consumeDiagnosisContext()).toBe("contexto de diagnóstico");
    expect(consumePromotionContext()).toEqual({ promotionId: "promo-1", message: "contexto de promoción" });
  });
});

describe("setServiceContext / consumeServiceContext (Services Phase 3)", () => {
  it("round-trip completo — lo que se guarda es exactamente lo que se consume", async () => {
    vi.stubGlobal("window", makeFakeWindow());
    const { setServiceContext, consumeServiceContext } = await import("../clientSession");

    setServiceContext({ slug: "seo", message: "Quiero saber más sobre SEO." });
    const result = consumeServiceContext();

    expect(result).toEqual({ slug: "seo", message: "Quiero saber más sobre SEO." });
  });

  it("consumir es de un solo uso — la segunda llamada devuelve null", async () => {
    vi.stubGlobal("window", makeFakeWindow());
    const { setServiceContext, consumeServiceContext } = await import("../clientSession");

    setServiceContext({ slug: "seo", message: "Hola" });
    consumeServiceContext();
    const second = consumeServiceContext();

    expect(second).toBeNull();
  });

  it("nada guardado → null, nunca lanza", async () => {
    vi.stubGlobal("window", makeFakeWindow());
    const { consumeServiceContext } = await import("../clientSession");

    expect(consumeServiceContext()).toBeNull();
  });

  it("JSON corrupto en sessionStorage → null, nunca lanza (defensivo, nunca confía en el storage)", async () => {
    const fakeWindow = makeFakeWindow();
    fakeWindow.sessionStorage.setItem("xayven_service_context", "{not valid json");
    vi.stubGlobal("window", fakeWindow);
    const { consumeServiceContext } = await import("../clientSession");

    expect(consumeServiceContext()).toBeNull();
  });

  it("forma inesperada (falta slug o message) → null, nunca un objeto a medias", async () => {
    const fakeWindow = makeFakeWindow();
    fakeWindow.sessionStorage.setItem("xayven_service_context", JSON.stringify({ slug: "seo" }));
    vi.stubGlobal("window", fakeWindow);
    const { consumeServiceContext } = await import("../clientSession");

    expect(consumeServiceContext()).toBeNull();
  });

  it("no usa la misma clave que setDiagnosisContext ni setPromotionContext — los tres handoffs nunca se pisan", async () => {
    vi.stubGlobal("window", makeFakeWindow());
    const { setDiagnosisContext, consumeDiagnosisContext } = await import("../clientSession");
    const { setPromotionContext, consumePromotionContext } = await import("../clientSession");
    const { setServiceContext, consumeServiceContext } = await import("../clientSession");

    setDiagnosisContext("contexto de diagnóstico");
    setPromotionContext({ promotionId: "promo-1", message: "contexto de promoción" });
    setServiceContext({ slug: "seo", message: "contexto de servicio" });

    expect(consumeDiagnosisContext()).toBe("contexto de diagnóstico");
    expect(consumePromotionContext()).toEqual({ promotionId: "promo-1", message: "contexto de promoción" });
    expect(consumeServiceContext()).toEqual({ slug: "seo", message: "contexto de servicio" });
  });
});

describe("openChatWidget", () => {
  it("despacha el evento OPEN_CHAT_EVENT en window", async () => {
    const fakeWindow = makeFakeWindow();
    vi.stubGlobal("window", fakeWindow);
    const { openChatWidget, OPEN_CHAT_EVENT } = await import("../clientSession");

    openChatWidget();

    expect(fakeWindow.dispatchEvent).toHaveBeenCalledTimes(1);
    const dispatchedEvent = fakeWindow.dispatchEvent.mock.calls[0]![0] as Event;
    expect(dispatchedEvent.type).toBe(OPEN_CHAT_EVENT);
  });
});
