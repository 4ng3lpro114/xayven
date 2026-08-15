import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { PromotionCtaButton } from "../PromotionCtaButton";

/**
 * Render-only, via react-dom/server (no jsdom, no click simulation) — same
 * documented scope as ClientActions.render.test.ts/
 * ConversationActions.render.test.ts. The click handler itself
 * (setPromotionContext + openChatWidget, see clientSession.test.ts for
 * its own coverage) is not exercised here — this only proves the button
 * renders the right label, and that promotionId/message never leak into
 * visible text (see PromotionCtaButton.tsx's doc comment: they travel
 * only as closure values).
 */
describe("PromotionCtaButton — renderizado", () => {
  it("muestra el label real de la promoción", () => {
    const html = renderToString(
      createElement(PromotionCtaButton, {
        promotionId: "promo-1",
        message: "Quiero aprovechar la promoción de agosto",
        label: "Quiero aprovecharla",
      })
    );

    expect(html).toContain("Quiero aprovecharla");
  });

  it("promotionId y message nunca aparecen como texto visible — solo viajan como props/closure", () => {
    const html = renderToString(
      createElement(PromotionCtaButton, {
        promotionId: "11111111-2222-3333-4444-555555555555",
        message: "Este es el mensaje interno que se envía al chat, no debe verse en el botón",
        label: "Ver oferta",
      })
    );

    expect(html).not.toContain("11111111-2222-3333-4444-555555555555");
    expect(html).not.toContain("Este es el mensaje interno");
  });
});
