import { describe, it, expect } from "vitest";
import { escapeIlikeSpecialChars } from "@/lib/db/paymentsStore";

/**
 * XAYVEN CORE Phase 3.0 (Email Lookup Hardening) — pure unit tests for
 * escapeIlikeSpecialChars(), the fix for the ILIKE wildcard false-positive
 * confirmed against real production data during the Phase 3.0 audit
 * (`echeverriangel_8@gmail.com` incorrectly matching the real client
 * `echeverriangel98@gmail.com` under unescaped `.ilike()`).
 *
 * Deliberately no Supabase/DB involved — this is a pure string transform,
 * fully exercisable in isolation. The actual round-trip against a real
 * ILIKE query was verified manually against production (read-only) as
 * part of the audit and the implementation checkpoint; this test suite
 * covers what the in-memory-only test environment can actually prove.
 */
describe("escapeIlikeSpecialChars", () => {
  it("1. email normal — permanece igual", () => {
    expect(escapeIlikeSpecialChars("test@example.com")).toBe("test@example.com");
  });

  it("2. underscore — se escapa", () => {
    expect(escapeIlikeSpecialChars("jane_doe@example.com")).toBe("jane\\_doe@example.com");
  });

  it("3. percent — se escapa", () => {
    expect(escapeIlikeSpecialChars("jane%doe@example.com")).toBe("jane\\%doe@example.com");
  });

  it("4. backslash — se escapa", () => {
    expect(escapeIlikeSpecialChars("jane\\doe@example.com")).toBe("jane\\\\doe@example.com");
  });

  it("5. combinación de los tres metacaracteres", () => {
    // Mismo ejemplo conceptual del prompt de implementación, verificado
    // manualmente paso a paso (backslash primero, luego %, luego _):
    //   "foo_bar%baz\test" -> "foo\_bar\%baz\\test"
    expect(escapeIlikeSpecialChars("foo_bar%baz\\test")).toBe("foo\\_bar\\%baz\\\\test");
  });

  it("6. múltiples metacaracteres consecutivos", () => {
    expect(escapeIlikeSpecialChars("__%%\\\\")).toBe("\\_\\_\\%\\%\\\\\\\\");
  });

  it("7. input ya limpio (sin metacaracteres) no cambia", () => {
    const clean = "angel.rojas+qa@xayven.com";
    expect(escapeIlikeSpecialChars(clean)).toBe(clean);
  });

  it("8. string vacío", () => {
    expect(escapeIlikeSpecialChars("")).toBe("");
  });

  it("el orden de escaping es correcto: el backslash introducido por _/% nunca vuelve a escaparse", () => {
    // Si el backslash se escapara DESPUÉS de %/_, el resultado tendría
    // backslashes duplicados de más (\\_  en vez de \_). Esta prueba
    // fallaría con un orden de operaciones incorrecto.
    expect(escapeIlikeSpecialChars("a_b")).toBe("a\\_b");
    expect(escapeIlikeSpecialChars("a%b")).toBe("a\\%b");
  });

  it("caso real confirmado en producción (Phase 3.0 audit): el candidato con underscore queda escapado literal", () => {
    expect(escapeIlikeSpecialChars("echeverriangel_8@gmail.com")).toBe("echeverriangel\\_8@gmail.com");
  });
});
