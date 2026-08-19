import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { CustomSelect } from "../CustomSelect";

/**
 * Render-only, via react-dom/server (no jsdom, no click/keyboard
 * simulation — the open panel + its motion/react animation only ever
 * mount client-side after a real interaction, out of scope here) — same
 * documented scope as CommercialMarketSelector.render.test.ts. This only
 * proves the closed (default) state: the hidden input FormData actually
 * reads carries the right name/value, the visible trigger shows the
 * placeholder or the selected option text, and the options list itself
 * is never silently dropped.
 */
const OPTIONS = ["Sitio web nuevo", "Renovación de sitio existente", "Tienda online", "Landing page", "Identidad de marca", "Otro"];

describe("CustomSelect — estado cerrado / backbone de FormData", () => {
  it("sin defaultValue → input oculto con value vacío, trigger muestra el placeholder", () => {
    const html = renderToString(
      createElement(CustomSelect, { id: "f-projectType", name: "projectType", options: OPTIONS, placeholder: "—" })
    );
    expect(html).toContain('name="projectType"');
    expect(html).toContain('value=""');
    expect(html).toContain("—");
  });

  it("con defaultValue → input oculto refleja ese valor exacto, nunca uno distinto de las opciones", () => {
    const html = renderToString(
      createElement(CustomSelect, {
        id: "f-projectType",
        name: "projectType",
        options: OPTIONS,
        placeholder: "—",
        defaultValue: "Tienda online",
      })
    );
    expect(html).toContain('value="Tienda online"');
    expect(html).toContain("Tienda online");
  });

  it("required se propaga al input oculto que FormData realmente lee", () => {
    const html = renderToString(
      createElement(CustomSelect, { id: "f-budget", name: "budget", options: OPTIONS, placeholder: "—", required: true })
    );
    expect(html).toContain('name="budget"');
    expect(html).toContain('required=""');
  });

  it("aria-invalid se propaga al trigger, nunca al input oculto (que no es lo que un lector de pantalla anuncia)", () => {
    const html = renderToString(
      createElement(CustomSelect, {
        id: "f-need",
        name: "need",
        options: OPTIONS,
        placeholder: "—",
        "aria-invalid": true,
      })
    );
    expect(html).toMatch(/role="combobox"[^>]*aria-invalid="true"/);
  });

  it("las opciones nunca se renderizan como <option> nativo — el value/label sigue siendo exactamente el string dado, sin transformarlo", () => {
    const html = renderToString(
      createElement(CustomSelect, { id: "f-priority", name: "priority", options: OPTIONS, placeholder: "—" })
    );
    expect(html).not.toContain("<option");
    expect(html).not.toContain("<select");
  });
});

/**
 * XAYVEN CORE Phase 3.5 (Admin UI consistency) — the two additions this
 * phase made to CustomSelect: `{value,label}` options (Admin's codes vs.
 * human labels, e.g. "QUOTE_ONLY" / "Solo cotización...") and `disabled`
 * (PackageForm's create-only category/billingInterval). Same render-only
 * scope as the suite above — proves the hidden input/FormData contract,
 * never simulates opening the panel.
 */
describe("CustomSelect — opciones {value,label} y disabled (Admin, Phase 3.5)", () => {
  const LABEL_OPTIONS = [
    { value: "QUOTE_ONLY", label: "Solo cotización (no muestra ningún precio)" },
    { value: "BASE_REFERENCE", label: "Referencia al precio base COP" },
  ];

  it("con opciones {value,label} → el input oculto lleva el value (código), el trigger muestra el label", () => {
    const html = renderToString(
      createElement(CustomSelect, {
        id: "f-fallbackBehavior",
        name: "fallbackBehavior",
        options: LABEL_OPTIONS,
        placeholder: "—",
        defaultValue: "QUOTE_ONLY",
      })
    );
    expect(html).toContain('name="fallbackBehavior"');
    expect(html).toContain('value="QUOTE_ONLY"');
    expect(html).toContain("Solo cotización (no muestra ningún precio)");
    // El código crudo nunca se muestra como texto visible del trigger.
    expect(html).not.toMatch(/>QUOTE_ONLY</);
  });

  it("disabled → el input oculto también queda disabled, igual que un <select disabled> nativo excluido de FormData", () => {
    const html = renderToString(
      createElement(CustomSelect, {
        id: "f-category",
        name: "category",
        options: LABEL_OPTIONS,
        placeholder: "—",
        defaultValue: "QUOTE_ONLY",
        disabled: true,
      })
    );
    const hiddenInput = html.match(/<input[^>]*name="category"[^>]*>/)?.[0] ?? "";
    expect(hiddenInput).toContain('disabled=""');
    const trigger = html.match(/<button[^>]*>/)?.[0] ?? "";
    expect(trigger).toContain('disabled=""');
  });

  it("sin disabled (default) → ni el input oculto ni el trigger llevan el atributo disabled", () => {
    const html = renderToString(
      createElement(CustomSelect, {
        id: "f-category",
        name: "category",
        options: LABEL_OPTIONS,
        placeholder: "—",
        defaultValue: "QUOTE_ONLY",
      })
    );
    expect(html).not.toContain("disabled=");
  });
});
