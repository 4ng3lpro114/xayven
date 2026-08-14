import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getClientIp, rateLimit } from "@/lib/rateLimit";

/**
 * Minimal stand-in for NextRequest — getClientIp() only ever touches
 * `request.headers.get(...)`, so a plain object with a real Headers
 * instance is enough and keeps these tests independent of Next.js's own
 * request construction.
 */
function makeRequest(headers: Record<string, string>): { headers: Headers } {
  return { headers: new Headers(headers) };
}

describe("getClientIp", () => {
  it("usa X-Real-IP cuando es una IP pública válida", () => {
    const req = makeRequest({ "x-real-ip": "203.0.113.7" });
    expect(getClientIp(req as never)).toBe("203.0.113.7");
  });

  it("recorre X-Forwarded-For desde la derecha y toma la primera IP pública", () => {
    // Simula un intento de spoofing: el cliente antepone una IP falsa;
    // el proxy real añade la suya al final — debe ganar la del final.
    const req = makeRequest({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" });
    expect(getClientIp(req as never)).toBe("203.0.113.9");
  });

  it("ignora entradas privadas/internas en X-Forwarded-For y sigue buscando", () => {
    const req = makeRequest({
      "x-forwarded-for": "198.51.100.5, 10.0.0.1, 192.168.1.1",
    });
    // De derecha a izquierda: 192.168.1.1 (privada) -> 10.0.0.1 (privada) -> 198.51.100.5 (pública)
    expect(getClientIp(req as never)).toBe("198.51.100.5");
  });

  it("prefiere X-Real-IP público sobre X-Forwarded-For si ambos están presentes", () => {
    const req = makeRequest({
      "x-real-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.5",
    });
    expect(getClientIp(req as never)).toBe("203.0.113.7");
  });

  it("si X-Real-IP es una IP privada, cae a X-Forwarded-For", () => {
    const req = makeRequest({
      "x-real-ip": "10.0.0.5",
      "x-forwarded-for": "198.51.100.5",
    });
    expect(getClientIp(req as never)).toBe("198.51.100.5");
  });

  it("nunca elige una IP privada cuando existe una pública disponible en cualquier header", () => {
    const req = makeRequest({
      "x-real-ip": "127.0.0.1",
      "x-forwarded-for": "10.0.0.1, 172.16.0.1",
    });
    // Ninguna candidata es pública — debe caer al primer valor disponible
    // (127.0.0.1, el primero insertado), nunca inventar una IP pública.
    expect(getClientIp(req as never)).toBe("127.0.0.1");
  });

  it("recorta espacios alrededor de las comas en X-Forwarded-For", () => {
    const req = makeRequest({ "x-forwarded-for": "  1.2.3.4  ,  203.0.113.9  " });
    expect(getClientIp(req as never)).toBe("203.0.113.9");
  });

  it("devuelve 'unknown' si no hay ningún header de proxy", () => {
    const req = makeRequest({});
    expect(getClientIp(req as never)).toBe("unknown");
  });

  it("ignora entradas vacías producidas por comas dobles en X-Forwarded-For", () => {
    const req = makeRequest({ "x-forwarded-for": "203.0.113.9,,198.51.100.5" });
    expect(getClientIp(req as never)).toBe("198.51.100.5");
  });
});

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("permite requests mientras estén bajo el límite", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      const result = rateLimit(key, { limit: 5, windowMs: 60_000 });
      expect(result.allowed).toBe(true);
    }
  });

  it("bloquea al alcanzar el límite dentro de la misma ventana", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      rateLimit(key, { limit: 3, windowMs: 60_000 });
    }
    const blocked = rateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resetea el conteo una vez pasada la ventana de tiempo", () => {
    const key = `test:${Math.random()}`;
    rateLimit(key, { limit: 1, windowMs: 1_000 });
    const blockedBeforeReset = rateLimit(key, { limit: 1, windowMs: 1_000 });
    expect(blockedBeforeReset.allowed).toBe(false);

    vi.advanceTimersByTime(1_001);

    const allowedAfterReset = rateLimit(key, { limit: 1, windowMs: 1_000 });
    expect(allowedAfterReset.allowed).toBe(true);
  });

  it("mantiene buckets independientes para claves distintas", () => {
    const keyA = `test-a:${Math.random()}`;
    const keyB = `test-b:${Math.random()}`;
    rateLimit(keyA, { limit: 1, windowMs: 60_000 });
    const blockedA = rateLimit(keyA, { limit: 1, windowMs: 60_000 });
    const allowedB = rateLimit(keyB, { limit: 1, windowMs: 60_000 });
    expect(blockedA.allowed).toBe(false);
    expect(allowedB.allowed).toBe(true);
  });
});
