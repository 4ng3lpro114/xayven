import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

/**
 * useRouter() throws outside a real Next.js App Router tree — mocked here
 * the same way as ConversationActions.render.test.ts.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { ClientActions } from "../ClientActions";
import { ClientImportanceBadge } from "../ClientImportanceBadge";

describe("ClientActions — renderizado condicional por importancia", () => {
  it("importance='protected' → muestra 'Cliente protegido', nunca el botón de eliminar", () => {
    const html = renderToString(
      createElement(ClientActions, { clientId: "c-1", importance: "protected" })
    );

    expect(html).toContain("Cliente protegido");
    expect(html).not.toContain("Eliminar cliente");
  });

  it("importance='normal' → muestra el botón 'Eliminar cliente'", () => {
    const html = renderToString(
      createElement(ClientActions, { clientId: "c-2", importance: "normal" })
    );

    expect(html).toContain("Eliminar cliente");
    expect(html).not.toContain("Cliente protegido");
  });

  it("importance='important' → también muestra el botón 'Eliminar cliente' (la advertencia más fuerte aparece recién tras el primer clic, no es verificable sin interacción real — ver nota en ConversationActions.test.ts)", () => {
    const html = renderToString(
      createElement(ClientActions, { clientId: "c-3", importance: "important" })
    );

    expect(html).toContain("Eliminar cliente");
  });
});

describe("ClientImportanceBadge — renderizado", () => {
  it("muestra la etiqueta correcta para cada nivel", () => {
    expect(renderToString(createElement(ClientImportanceBadge, { importance: "normal" }))).toContain(
      "Normal"
    );
    expect(
      renderToString(createElement(ClientImportanceBadge, { importance: "important" }))
    ).toContain("Importante");
    expect(
      renderToString(createElement(ClientImportanceBadge, { importance: "protected" }))
    ).toContain("Protegido");
  });
});
