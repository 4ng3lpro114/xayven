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
  it("importance='protected' sin protectedReason → mensaje genérico de respaldo, nunca el botón de eliminar", () => {
    const html = renderToString(
      createElement(ClientActions, { clientId: "c-1", importance: "protected" })
    );

    expect(html).toContain("Cliente protegido");
    expect(html).toContain("actividad comercial asociada");
    expect(html).not.toContain("Eliminar cliente");
  });

  it("importance='protected' + protectedReason='has_related_projects' → mensaje específico de proyectos asociados", () => {
    const html = renderToString(
      createElement(ClientActions, {
        clientId: "c-1b",
        importance: "protected",
        protectedReason: "has_related_projects",
      })
    );

    expect(html).toContain("Cliente protegido");
    expect(html).toContain("Este cliente no se puede eliminar porque tiene proyectos asociados.");
    expect(html).not.toContain("Eliminar cliente");
  });

  it("importance='protected' + protectedReason='has_payments' → mensaje más fuerte, específico de pagos registrados", () => {
    const html = renderToString(
      createElement(ClientActions, {
        clientId: "c-1c",
        importance: "protected",
        protectedReason: "has_payments",
      })
    );

    expect(html).toContain("Cliente protegido");
    expect(html).toContain("Este cliente está protegido porque tiene proyectos con pagos registrados.");
    expect(html).not.toContain("Eliminar cliente");
  });

  it("importance='normal' → muestra el botón 'Eliminar cliente' (primera interacción arma la confirmación; el flujo de doble clic ya está cubierto en requestDeleteClient/ClientActions.test.ts)", () => {
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
    expect(html).not.toContain("Cliente protegido");
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
