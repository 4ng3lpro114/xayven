import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { AccountBadge } from "../AccountBadge";

describe("AccountBadge", () => {
  it("muestra el texto exacto 'Cuenta XAYVEN'", () => {
    const html = renderToString(createElement(AccountBadge));
    expect(html).toContain("Cuenta XAYVEN");
  });

  it("usa el tono morado/acento de XAYVEN, no un color genérico", () => {
    const html = renderToString(createElement(AccountBadge));
    expect(html).toContain("rgba(145,82,255");
  });
});
