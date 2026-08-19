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
 * PromotionCtaButton.render.test.ts/ClientActions.render.test.ts.
 *
 * XAYVEN CORE Phase 3.1 — rewritten for `detectionState: "manual" |
 * "detected" | "fallback"` (replaces the old `isManual: boolean`, which
 * could never distinguish a real geo hit from a failed detection). These
 * tests exist specifically to prove the three states never bleed into
 * each other — in particular, that 'fallback' never borrows Colombia's
 * (or any real market's) name/flag, and that 'manual'/'detected' are
 * visually distinguishable even though both resolve to a real market.
 */
const MARKETS = [
  { code: "CO", currency: "COP" },
  { code: "US", currency: "USD" },
  { code: "EU", currency: "EUR" },
  { code: "OTHER", currency: "COP" },
];

const MARKET_NAMES_ES = { CO: "Colombia", US: "Estados Unidos", EU: "Europa", OTHER: "Otros mercados" };

const MARKET_DETAILS_ES = {
  CO: { currencyName: "Pesos colombianos", symbol: "$" },
  US: { currencyName: "Dólares estadounidenses", symbol: "$" },
  EU: { currencyName: "Euros", symbol: "€" },
  OTHER: { currencyName: null, symbol: "$" },
};

function render(props: Partial<Parameters<typeof CommercialMarketSelector>[0]> = {}) {
  return renderToString(
    createElement(CommercialMarketSelector, {
      markets: MARKETS,
      currentMarketCode: "CO",
      detectionState: "manual",
      marketNames: MARKET_NAMES_ES,
      marketDetails: MARKET_DETAILS_ES,
      label: "Mercado comercial",
      explanation: "Tu mercado determina el precio comercial. La moneda solo cambia cómo se muestra.",
      automaticLabel: "Detectar automáticamente",
      detectedLabel: "Detectado automáticamente",
      manualLabel: "Seleccionado manualmente",
      fallbackLabel: "No pudimos determinar tu ubicación",
      fallbackCountryLabel: "Otros países",
      activeLabel: "ACTIVA",
      ...props,
    })
  );
}

describe("CommercialMarketSelector — estado cerrado", () => {
  it("detectionState='manual' → muestra el nombre de la moneda, el subtítulo 'Seleccionado manualmente' y el badge ACTIVA", () => {
    const html = render({ detectionState: "manual", currentMarketCode: "EU" });
    expect(html).toContain("EUR");
    expect(html).toContain("Euros");
    expect(html).toContain("Seleccionado manualmente");
    expect(html).toContain("ACTIVA");
    expect(html).not.toContain("Detectado automáticamente");
    expect(html).not.toContain("No pudimos determinar");
  });

  it("detectionState='detected' → mismo mercado que 'manual' pero con el subtítulo 'Detectado automáticamente', nunca 'Seleccionado manualmente'", () => {
    const html = render({ detectionState: "detected", currentMarketCode: "US" });
    expect(html).toContain("USD");
    expect(html).toContain("Dólares estadounidenses");
    expect(html).toContain("Detectado automáticamente");
    expect(html).not.toContain("Seleccionado manualmente");
  });

  it("detectionState='fallback' → NUNCA muestra el nombre/bandera de Colombia ni de ningún mercado real, incluso si currentMarketCode='OTHER'", () => {
    const html = render({ detectionState: "fallback", currentMarketCode: "OTHER" });
    expect(html).toContain("Otros mercados");
    expect(html).toContain("No pudimos determinar tu ubicación");
    expect(html).not.toContain("Colombia");
    expect(html).not.toContain("Seleccionado manualmente");
    expect(html).not.toContain("Detectado automáticamente");
    // El badge ACTIVA es engañoso en un estado de fallo — nunca se muestra aquí.
    expect(html).not.toContain("ACTIVA");
  });

  it("manual + OTHER (elegido a propósito) se distingue de fallback + OTHER (detección fallida) — mismo mercado, subtítulo distinto", () => {
    const manualOther = render({ detectionState: "manual", currentMarketCode: "OTHER" });
    const fallbackOther = render({ detectionState: "fallback", currentMarketCode: "OTHER" });
    expect(manualOther).toContain("Seleccionado manualmente");
    expect(fallbackOther).toContain("No pudimos determinar tu ubicación");
    expect(manualOther).not.toContain("No pudimos determinar tu ubicación");
    expect(fallbackOther).not.toContain("Seleccionado manualmente");
  });

  it("mercado sin traducción en marketNames → cae al código crudo, nunca rompe el render", () => {
    const html = render({ detectionState: "manual", currentMarketCode: "US", marketNames: {}, marketDetails: {} });
    expect(html).toContain("US");
  });

  it("nombres vienen del prop i18n (EN), nunca hardcodeados en español", () => {
    const html = render({
      detectionState: "manual",
      currentMarketCode: "US",
      marketNames: { CO: "Colombia", US: "United States", EU: "Europe", OTHER: "Other markets" },
      marketDetails: { US: { currencyName: "US dollars", symbol: "$" } },
      manualLabel: "Manually selected",
    });
    expect(html).toContain("US dollars");
    expect(html).toContain("Manually selected");
  });
});
