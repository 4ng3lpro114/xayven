import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { NewClientsChart } from "../NewClientsChart";

describe("NewClientsChart — estados de renderizado", () => {
  it("sin clientes nuevos en el período → empty state, nunca barras en 0", () => {
    const html = renderToString(
      createElement(NewClientsChart, {
        points: [
          { date: "2026-08-01T00:00:00.000Z", label: "01 ago", value: 0 },
          { date: "2026-08-02T00:00:00.000Z", label: "02 ago", value: 0 },
        ],
        periodLabel: "30 días",
      })
    );

    expect(html).toContain("Sin clientes nuevos");
    expect(html).not.toContain('role="img"');
  });

  it("con datos → renderiza barras y el total", () => {
    const html = renderToString(
      createElement(NewClientsChart, {
        points: [
          { date: "2026-08-01T00:00:00.000Z", label: "01 ago", value: 2 },
          { date: "2026-08-02T00:00:00.000Z", label: "02 ago", value: 1 },
        ],
        periodLabel: "7 días",
      })
    );

    expect(html).toContain('role="img"');
    expect(html).toContain("<title>01 ago: 2 clientes nuevos</title>");
    expect(html).toContain("en total durante");
    expect(html).toContain(">3<");
  });
});
