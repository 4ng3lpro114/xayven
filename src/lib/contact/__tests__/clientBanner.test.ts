import { describe, it, expect } from "vitest";
import { deriveContactRequestClientBanner } from "@/lib/contact/clientBanner";

describe("deriveContactRequestClientBanner", () => {
  it("clientWasCreated=true → 'Cliente creado', sin texto explicativo", () => {
    const banner = deriveContactRequestClientBanner(true);
    expect(banner.title).toBe("Cliente creado");
    expect(banner.explanation).toBeNull();
  });

  it("clientWasCreated=false → 'Cliente ya existente' con el texto explicativo exacto", () => {
    const banner = deriveContactRequestClientBanner(false);
    expect(banner.title).toBe("Cliente ya existente");
    expect(banner.explanation).toBe(
      "Esta solicitud se vinculó con un cliente que ya estaba registrado en XAYVEN para evitar crear un duplicado."
    );
  });

  it("clientWasCreated=null (solicitud antigua) → estado neutral 'Cliente asociado', sin inventar true/false", () => {
    const banner = deriveContactRequestClientBanner(null);
    expect(banner.title).toBe("Cliente asociado");
    expect(banner.explanation).toBeNull();
  });
});
