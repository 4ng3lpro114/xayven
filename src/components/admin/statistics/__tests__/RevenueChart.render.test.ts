import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { RevenueChart } from "../RevenueChart";

describe("RevenueChart — estados de renderizado", () => {
  it("currency null (sin pagos aprobados en el período) → empty state elegante, nunca una línea en 0", () => {
    const html = renderToString(
      createElement(RevenueChart, {
        points: [],
        currency: null,
        otherCurrenciesExcluded: [],
        periodLabel: "30 días",
      })
    );

    expect(html).toContain("Sin ingresos registrados");
    expect(html).not.toContain('role="img"');
  });

  it("con datos → renderiza el SVG con un punto por bucket", () => {
    const html = renderToString(
      createElement(RevenueChart, {
        points: [
          { date: "2026-08-01T00:00:00.000Z", label: "01 ago", value: 1000 },
          { date: "2026-08-02T00:00:00.000Z", label: "02 ago", value: 2000 },
        ],
        currency: "COP",
        otherCurrenciesExcluded: [],
        periodLabel: "7 días",
      })
    );

    expect(html).toContain("<svg");
    expect(html).toContain("COP");
    expect(html).toContain("01 ago");
  });

  it("avisa de monedas excluidas en vez de ocultarlas en silencio", () => {
    const html = renderToString(
      createElement(RevenueChart, {
        points: [{ date: "2026-08-01T00:00:00.000Z", label: "01 ago", value: 1000 }],
        currency: "COP",
        otherCurrenciesExcluded: ["USD"],
        periodLabel: "7 días",
      })
    );

    expect(html).toContain("USD");
    expect(html).toContain("no incluidos");
  });
});
