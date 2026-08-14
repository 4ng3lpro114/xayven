import { describe, it, expect } from "vitest";
import { buildContactRequestMailto } from "@/lib/contact/mailto";

describe("buildContactRequestMailto", () => {
  it("construye un mailto: con el email y el asunto exacto pedidos", () => {
    const href = buildContactRequestMailto("diana@example.com");
    expect(href).toBe("mailto:diana%40example.com?subject=Solicitud%20de%20proyecto%20XAYVEN");
  });

  it("escapa caracteres especiales en el email para no romper el query string", () => {
    const href = buildContactRequestMailto("a+b?c@example.com");
    expect(href).toContain("mailto:a%2Bb%3Fc%40example.com?subject=");
    // El '?' del email nunca debe terminar el mailto antes del subject real.
    expect(href.split("?").length).toBe(2);
  });
});
