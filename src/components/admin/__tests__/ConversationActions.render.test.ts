import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

/**
 * useRouter() (used for the post-delete redirect to /admin) throws
 * "invariant expected app router to be mounted" outside a real Next.js App
 * Router tree, which a bare renderToString() call never provides — mocked
 * here the same way @/lib/auth/admin is mocked in the API route tests, no
 * new dependency needed.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { ConversationActions } from "../ConversationActions";

/**
 * Presentational (conditional-rendering) coverage using react-dom/server's
 * renderToString — needs no new dependencies (react-dom is already a
 * runtime dependency) and no DOM/jsdom, since it never simulates events,
 * only inspects the static HTML of a single render pass. Uses
 * React.createElement instead of JSX so this file can stay a plain .ts
 * file matching vitest.config.mts's existing `include` glob
 * ("src/**\/__tests__/**\/*.test.ts") without changing it.
 *
 * Interaction-based behavior (clicking the button, loading state, the
 * double-click guard, the two-step delete confirmation) is NOT — and
 * cannot be — covered here; see the note in ConversationActions.test.ts.
 */
describe("ConversationActions — conditional rendering", () => {
  it("sin clientId → muestra el botón 'Convertir en cliente'", () => {
    const html = renderToString(
      createElement(ConversationActions, { conversationId: "conv-1", clientId: null })
    );

    expect(html).toContain("Convertir en cliente");
    expect(html).not.toContain("Cliente vinculado");
  });

  it("con clientId ya existente → muestra 'Cliente vinculado', no el botón de convertir", () => {
    const html = renderToString(
      createElement(ConversationActions, { conversationId: "conv-2", clientId: "client-123" })
    );

    expect(html).toContain("Cliente vinculado");
    expect(html).not.toContain("Convertir en cliente");
  });

  it("el botón 'Convertir en proyecto' (placeholder, sin tocar en esta fase) sigue presente en ambos casos", () => {
    const withoutClient = renderToString(
      createElement(ConversationActions, { conversationId: "conv-3", clientId: null })
    );
    const withClient = renderToString(
      createElement(ConversationActions, { conversationId: "conv-4", clientId: "client-456" })
    );

    expect(withoutClient).toContain("Convertir en proyecto");
    expect(withClient).toContain("Convertir en proyecto");
  });

  it("sin clientId → muestra 'Eliminar conversación'", () => {
    const html = renderToString(
      createElement(ConversationActions, { conversationId: "conv-5", clientId: null })
    );

    expect(html).toContain("Eliminar conversación");
  });

  it("con clientId ya existente → NO muestra 'Eliminar conversación' (regla también reforzada en el backend)", () => {
    const html = renderToString(
      createElement(ConversationActions, { conversationId: "conv-6", clientId: "client-789" })
    );

    expect(html).not.toContain("Eliminar conversación");
  });
});
