import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { StatCard } from "../StatCard";

describe("StatCard — variante muted (Fase 7B revisión final)", () => {
  it("muted=true usa un color de valor visualmente más débil que el default", () => {
    const mutedHtml = renderToString(createElement(StatCard, { label: "Cancelados", value: 3, muted: true }));
    const normalHtml = renderToString(createElement(StatCard, { label: "Pendientes", value: 3 }));

    expect(mutedHtml).toContain("text-fg-subtle\">3");
    expect(normalHtml).toContain("text-fg\">3");
    expect(normalHtml).not.toContain("text-fg-subtle\">3");
  });

  it("trendPct null nunca se muestra (no fabrica un porcentaje sobre una base inexistente)", () => {
    const html = renderToString(createElement(StatCard, { label: "X", value: 1, trendPct: null }));
    expect(html).not.toContain("%");
  });
});
