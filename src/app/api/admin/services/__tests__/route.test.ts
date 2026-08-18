import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getServiceById } from "@/lib/db/servicesStore";

const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/services", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function minimalContent(heading: string) {
  return {
    heading,
    tagline: "tagline",
    definition: "definition",
    problem: ["problem 1"],
    solution: "solution",
    includes: ["includes 1"],
    forWhom: { idealIf: ["ideal 1"], notIdealIf: [] },
    useCases: [],
    faq: [],
  };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    slug: `test-service-${Math.random().toString(36).slice(2, 8)}`,
    displayOrder: 99,
    isPublished: true,
    relatedPackageSlugs: [],
    content: { es: minimalContent("Prueba"), en: minimalContent("Test") },
    ...overrides,
  };
}

describe("POST /api/admin/services", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(401);
  });

  it("body válido → 200, crea el servicio", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.serviceId).toBeTruthy();

    const created = await getServiceById(body.serviceId);
    expect(created?.content.es.heading).toBe("Prueba");
    expect(created?.content.en.heading).toBe("Test");
  });

  it("slug duplicado (uno de los 5 seed) → 409 slug_conflict", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest(validBody({ slug: "seo" })));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("slug_conflict");
  });

  it("falta contenido en inglés → 400 validation_failed (ninguna traducción incompleta)", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const body = validBody();
    // @ts-expect-error deliberately malformed for this test
    delete body.content.en;
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it("includes vacío → 400 validation_failed (no se permite un servicio sin capacidades)", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const body = validBody();
    body.content.es.includes = [];
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it("solo exporta POST — GET/PUT/DELETE/PATCH quedan rechazados automáticamente (405)", async () => {
    const routeModule = await import("../route");
    expect("GET" in routeModule).toBe(false);
    expect("PUT" in routeModule).toBe(false);
    expect("DELETE" in routeModule).toBe(false);
    expect("PATCH" in routeModule).toBe(false);
  });
});
