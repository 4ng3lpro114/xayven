import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

// useRouter() throws outside a real Next.js App Router tree — same fix
// already used in ConversationActions.render.test.ts / ClientActions.render.test.ts.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { NewProjectForm } from "../NewProjectForm";

describe("NewProjectForm — cliente preseleccionado (Fase 6)", () => {
  it("sin preselectedClient → muestra los inputs de cliente, comportamiento de siempre", () => {
    const html = renderToString(createElement(NewProjectForm, {}));

    expect(html).toContain('name="clientName"');
    expect(html).toContain('name="clientEmail"');
    expect(html).toContain('name="clientPhone"');
    expect(html).not.toContain("Proyecto para");
  });

  it("con preselectedClient → muestra sus datos de solo lectura, NUNCA los inputs de cliente", () => {
    const html = renderToString(
      createElement(NewProjectForm, {
        preselectedClient: {
          id: "client-1",
          name: "Angel Rojas",
          email: "angel@example.com",
          company: "Restaurante XAYVEN Test",
        },
      })
    );

    expect(html).toContain("Proyecto para");
    expect(html).toContain("Angel Rojas");
    expect(html).toContain("angel@example.com");
    expect(html).toContain("Restaurante XAYVEN Test");
    expect(html).not.toContain('name="clientName"');
    expect(html).not.toContain('name="clientEmail"');
    expect(html).not.toContain('name="clientPhone"');
  });

  it("con preselectedClient sin empresa conocida → no la inventa, simplemente omite esa línea", () => {
    const html = renderToString(
      createElement(NewProjectForm, {
        preselectedClient: {
          id: "client-2",
          name: "Sin Empresa Conocida",
          email: "sin-empresa@example.com",
          company: null,
        },
      })
    );

    expect(html).toContain("Sin Empresa Conocida");
    expect(html).not.toContain("null");
  });

  it("siempre pide nombre y monto del proyecto, con o sin cliente preseleccionado", () => {
    const withClient = renderToString(
      createElement(NewProjectForm, {
        preselectedClient: { id: "c-1", name: "A", email: "a@example.com", company: null },
      })
    );
    const withoutClient = renderToString(createElement(NewProjectForm, {}));

    for (const html of [withClient, withoutClient]) {
      expect(html).toContain('name="projectName"');
      expect(html).toContain('name="totalAmount"');
      expect(html).toContain('name="currency"');
    }
  });
});
