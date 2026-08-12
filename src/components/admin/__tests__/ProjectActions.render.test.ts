import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

/**
 * useRouter() throws outside a real Next.js App Router tree — mocked here
 * the same way as ClientActions.render.test.ts/ConversationActions.render.test.ts.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { ProjectActions } from "../ProjectActions";

describe("ProjectActions — renderizado condicional por importancia", () => {
  it("importance='protected' sin protectedReason → mensaje genérico de respaldo, nunca el botón de eliminar", () => {
    const html = renderToString(
      createElement(ProjectActions, { projectId: "p-1", importance: "protected" })
    );

    expect(html).toContain("Proyecto protegido");
    expect(html).not.toContain("Eliminar proyecto");
  });

  it("importance='protected' + protectedReason='has_payments' → mensaje específico de pagos registrados", () => {
    const html = renderToString(
      createElement(ProjectActions, {
        projectId: "p-1b",
        importance: "protected",
        protectedReason: "has_payments",
      })
    );

    expect(html).toContain("Proyecto protegido");
    expect(html).toContain("Este proyecto no se puede eliminar porque tiene pagos registrados.");
    expect(html).not.toContain("Eliminar proyecto");
  });

  it("importance='protected' + protectedReason='has_payment_attempts' → mensaje específico de intentos de pago", () => {
    const html = renderToString(
      createElement(ProjectActions, {
        projectId: "p-1c",
        importance: "protected",
        protectedReason: "has_payment_attempts",
      })
    );

    expect(html).toContain(
      "Este proyecto no se puede eliminar porque tiene intentos de pago registrados."
    );
    expect(html).not.toContain("Eliminar proyecto");
  });

  it("importance='protected' + protectedReason='active_work' → mensaje específico de etapa de trabajo activa", () => {
    const html = renderToString(
      createElement(ProjectActions, {
        projectId: "p-1d",
        importance: "protected",
        protectedReason: "active_work",
      })
    );

    expect(html).toContain(
      "Este proyecto no se puede eliminar porque se encuentra en una etapa de trabajo activa."
    );
    expect(html).not.toContain("Eliminar proyecto");
  });

  it("importance='normal' → muestra el botón 'Eliminar proyecto'", () => {
    const html = renderToString(
      createElement(ProjectActions, { projectId: "p-2", importance: "normal" })
    );

    expect(html).toContain("Eliminar proyecto");
    expect(html).not.toContain("Proyecto protegido");
  });

  it("importance='important' → también muestra el botón 'Eliminar proyecto' (la advertencia más fuerte aparece recién tras el primer clic, no es verificable sin interacción real — ver nota en ClientActions.render.test.ts)", () => {
    const html = renderToString(
      createElement(ProjectActions, { projectId: "p-3", importance: "important" })
    );

    expect(html).toContain("Eliminar proyecto");
    expect(html).not.toContain("Proyecto protegido");
  });
});
