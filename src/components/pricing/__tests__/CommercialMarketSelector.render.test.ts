import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

/**
 * useRouter()/usePathname() throw outside a real Next.js App Router tree
 * — mocked here the same way as ClientActions.render.test.ts/
 * ConversationActions.render.test.ts. usePathname() resolves to a public
 * (non-excluded) route so the excluded-route early return never masks
 * the assertions below — that early return itself needs a browser-level
 * integration test to verify meaningfully, out of scope for a render-only
 * check.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/es/services",
}));

import { CommercialMarketSelector } from "../CommercialMarketSelector";

/**
 * Render-only, via react-dom/server (no jsdom, no click simulation,
 * document.cookie not exercised) — same documented scope as
 * PromotionCtaButton.render.test.ts/ClientActions.render.test.ts. This
 * only proves the closed-state pill shows the right thing given
 * `isManual`/`marketNames`, and that market names come from the i18n
 * prop, never a hardcoded/English string.
 */
const MARKETS = [
  { code: "CO", currency: "COP" },
  { code: "US", currency: "USD" },
  { code: "EU", currency: "EUR" },
  { code: "OTHER", currency: "COP" },
];

const MARKET_NAMES_ES = { CO: "Colombia", US: "Estados Unidos", EU: "Europa", OTHER: "Otros mercados" };

function render(props: Partial<Parameters<typeof CommercialMarketSelector>[0]> = {}) {
  return renderToString(
    createElement(CommercialMarketSelector, {
      markets: MARKETS,
      currentMarketCode: "CO",
      isManual: false,
      marketNames: MARKET_NAMES_ES,
      label: "Mercado comercial",
      explanation: "Tu mercado determina el precio comercial. La moneda solo cambia cómo se muestra.",
      automaticLabel: "Detectar automáticamente",
      ...props,
    })
  );
}

describe("CommercialMarketSelector — estado cerrado", () => {
  it("isManual=false → muestra el label automático, nunca el nombre de un mercado, aunque currentMarketCode exista", () => {
    const html = render({ isManual: false, currentMarketCode: "EU" });
    expect(html).toContain("Detectar automáticamente");
    expect(html).not.toContain("Europa");
  });

  it("isManual=true → muestra el nombre localizado (i18n) y la moneda del mercado seleccionado, no el código crudo", () => {
    const html = render({ isManual: true, currentMarketCode: "EU" });
    expect(html).toContain("Europa");
    expect(html).toContain("EUR");
    expect(html).not.toContain("Detectar automáticamente");
  });

  it("mercado sin traducción en marketNames → cae al código crudo, nunca rompe el render", () => {
    const html = render({ isManual: true, currentMarketCode: "US", marketNames: {} });
    expect(html).toContain("US");
  });

  it("nombres vienen del prop i18n (EN), nunca hardcodeados en español", () => {
    const html = render({
      isManual: true,
      currentMarketCode: "US",
      marketNames: { CO: "Colombia", US: "United States", EU: "Europe", OTHER: "Other markets" },
    });
    expect(html).toContain("United States");
  });
});
