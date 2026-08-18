import { describe, it, expect } from "vitest";
import { checkNumericGuard } from "@/lib/ai/numericGuard";

describe("checkNumericGuard — CAPA 2, detección post-hoc, NUNCA bloquea ni modifica", () => {
  it("respuesta sin ningún número con forma de precio → no flaggeada", () => {
    const result = checkNumericGuard("Claro, con gusto te cuento más sobre nuestros servicios.", []);
    expect(result.flagged).toBe(false);
    expect(result.suspiciousMatches).toEqual([]);
  });

  it("respuesta con un precio EXACTAMENTE igual a un monto autorizado este turno → no flaggeada", () => {
    const result = checkNumericGuard("El precio oficial de START es $399 USD.", [399]);
    expect(result.flagged).toBe(false);
  });

  it("respuesta con un precio formateado con separador de miles (COP) que coincide con un monto autorizado → no flaggeada", () => {
    const result = checkNumericGuard("El plan Essential cuesta 149.000 COP al mes.", [149000]);
    expect(result.flagged).toBe(false);
  });

  it("respuesta con un precio que NO corresponde a ningún monto autorizado este turno → flaggeada", () => {
    const result = checkNumericGuard("El plan Essential cuesta $10.000 al mes.", [149000]);
    expect(result.flagged).toBe(true);
    expect(result.suspiciousMatches.length).toBeGreaterThan(0);
  });

  it("respuesta con precio y CERO montos autorizados este turno (el modelo respondió sin llamar la tool) → flaggeada", () => {
    const result = checkNumericGuard("Nuestros paquetes empiezan en $45 USD.", []);
    expect(result.flagged).toBe(true);
  });

  it("respuesta con displayAmount Y officialAmount autorizados (isOfficialCurrency=false) → ninguno de los dos flaggea", () => {
    // 399 USD oficial, equivalente ~1.596.000 COP de visualización — ambos
    // números legítimos en la misma respuesta.
    const reply = "El precio oficial es $399 USD; en pesos colombianos equivale aproximadamente a 1.596.000 COP.";
    const result = checkNumericGuard(reply, [399, 1_596_000]);
    expect(result.flagged).toBe(false);
  });

  it("nunca modifica ni reemplaza el texto — la respuesta original no se toca", () => {
    const reply = "El plan Essential cuesta $999.999 al mes.";
    checkNumericGuard(reply, [149000]);
    expect(reply).toBe("El plan Essential cuesta $999.999 al mes."); // sin mutar
  });

  it("números pequeños sueltos (sin símbolo de moneda ni separador de miles) NUNCA flaggean — evita falsos positivos con cantidades/años/features", () => {
    const result = checkNumericGuard("Tenemos 5 paquetes web y llevamos 3 años en el mercado.", []);
    expect(result.flagged).toBe(false);
  });
});

describe("checkNumericGuard — exclusión por userMessage (micro-fix post R4 live verification)", () => {
  it("caso real observado en R4: el modelo repite el presupuesto que el VISITANTE dijo → no flaggea", () => {
    const userMessage = "Me interesa START pero solo tengo 100.000 pesos de presupuesto.";
    const reply = "El paquete START tiene un precio oficial de 799.000 pesos. Entiendo que tu presupuesto es de 100.000 pesos, pero no podemos ofrecer descuentos.";
    const result = checkNumericGuard(reply, [799000], userMessage);
    expect(result.flagged).toBe(false);
  });

  it("un precio genuinamente NO autorizado sigue flaggeando aunque se pase userMessage, si esa cifra no está en el mensaje del visitante", () => {
    const userMessage = "Me interesa START pero solo tengo 100.000 pesos de presupuesto.";
    const reply = "El paquete START tiene un precio oficial de 799.000 pesos, pero como estás empezando te lo dejamos en $10.000.";
    const result = checkNumericGuard(reply, [799000], userMessage);
    expect(result.flagged).toBe(true);
    expect(result.suspiciousMatches.some((m) => m.includes("10.000"))).toBe(true);
  });

  it("sin userMessage (comportamiento previo intacto) → sigue flaggeando lo no autorizado, sin excepción", () => {
    const reply = "El plan Essential cuesta 100.000 COP al mes.";
    const result = checkNumericGuard(reply, [149000]); // sin tercer argumento
    expect(result.flagged).toBe(true);
  });

  it("userMessage vacío/undefined nunca rompe la función, nunca lanza", () => {
    expect(() => checkNumericGuard("El precio es $999.999.", [], "")).not.toThrow();
    expect(() => checkNumericGuard("El precio es $999.999.", [], undefined)).not.toThrow();
  });

  it("nunca modifica ni el reply ni el userMessage — ambos textos originales intactos tras la llamada", () => {
    const userMessage = "Tengo 100.000 pesos.";
    const reply = "Tu presupuesto de 100.000 pesos no alcanza para START (799.000).";
    checkNumericGuard(reply, [799000], userMessage);
    expect(userMessage).toBe("Tengo 100.000 pesos.");
    expect(reply).toBe("Tu presupuesto de 100.000 pesos no alcanza para START (799.000).");
  });
});
