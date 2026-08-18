import { describe, it, expect } from "vitest";
import { toLines, fromLines, toFaqText, fromFaqText, parseFaqText } from "../textLists";

describe("toLines / fromLines", () => {
  it("round-trip completo", () => {
    const items = ["uno", "dos", "tres"];
    expect(fromLines(toLines(items))).toEqual(items);
  });

  it("descarta líneas vacías al parsear", () => {
    expect(fromLines("uno\n\n\ndos\n")).toEqual(["uno", "dos"]);
  });

  it("recorta espacios de cada línea", () => {
    expect(fromLines("  uno  \n  dos  ")).toEqual(["uno", "dos"]);
  });

  it("array vacío → string vacío → array vacío", () => {
    expect(toLines([])).toBe("");
    expect(fromLines("")).toEqual([]);
  });
});

describe("toFaqText / fromFaqText", () => {
  it("round-trip completo", () => {
    const items = [
      { question: "¿Q1?", answer: "A1." },
      { question: "¿Q2?", answer: "A2." },
    ];
    expect(fromFaqText(toFaqText(items))).toEqual(items);
  });

  it("un bloque sin línea Q: o sin línea A: se descarta, nunca produce un FAQ a medias", () => {
    const text = "Q: Pregunta completa\nA: Respuesta completa\n\nQ: Pregunta sin respuesta\n\nA: Respuesta sin pregunta";
    expect(fromFaqText(text)).toEqual([{ question: "Pregunta completa", answer: "Respuesta completa" }]);
  });

  it("texto vacío → array vacío", () => {
    expect(fromFaqText("")).toEqual([]);
  });

  it("tolera líneas en blanco extra entre bloques", () => {
    const text = "Q: Uno\nA: Uno-respuesta\n\n\n\nQ: Dos\nA: Dos-respuesta";
    expect(fromFaqText(text)).toEqual([
      { question: "Uno", answer: "Uno-respuesta" },
      { question: "Dos", answer: "Dos-respuesta" },
    ]);
  });
});

describe("parseFaqText (Pre-Production Correction R2)", () => {
  it("todo bien formado → items completos, invalidBlocks vacío", () => {
    const text = "Q: Uno\nA: Uno-respuesta\n\nQ: Dos\nA: Dos-respuesta";
    const result = parseFaqText(text);
    expect(result.items).toEqual([
      { question: "Uno", answer: "Uno-respuesta" },
      { question: "Dos", answer: "Dos-respuesta" },
    ]);
    expect(result.invalidBlocks).toEqual([]);
  });

  it("un bloque sin línea A: se reporta en invalidBlocks, no desaparece en silencio", () => {
    const text = "Q: Pregunta completa\nA: Respuesta completa\n\nQ: Pregunta sin respuesta";
    const result = parseFaqText(text);
    expect(result.items).toEqual([{ question: "Pregunta completa", answer: "Respuesta completa" }]);
    expect(result.invalidBlocks).toEqual(["Q: Pregunta sin respuesta"]);
  });

  it("un bloque sin línea Q: también se reporta en invalidBlocks", () => {
    const text = "A: Respuesta huérfana";
    const result = parseFaqText(text);
    expect(result.items).toEqual([]);
    expect(result.invalidBlocks).toEqual(["A: Respuesta huérfana"]);
  });

  it("varios bloques inválidos → todos aparecen en invalidBlocks, en orden", () => {
    const text = "Q: Solo pregunta uno\n\nA: Solo respuesta\n\nQ: Solo pregunta dos";
    const result = parseFaqText(text);
    expect(result.items).toEqual([]);
    expect(result.invalidBlocks).toEqual(["Q: Solo pregunta uno", "A: Solo respuesta", "Q: Solo pregunta dos"]);
  });

  it("texto vacío → items e invalidBlocks ambos vacíos", () => {
    const result = parseFaqText("");
    expect(result.items).toEqual([]);
    expect(result.invalidBlocks).toEqual([]);
  });

  it("fromFaqText() sigue siendo la vista permisiva (solo items) — mismo comportamiento que antes de R2", () => {
    const text = "Q: Completo\nA: Sí\n\nQ: Incompleto";
    expect(fromFaqText(text)).toEqual([{ question: "Completo", answer: "Sí" }]);
  });
});
