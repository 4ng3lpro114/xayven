import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createService, getServiceById } from "@/lib/db/servicesStore";
import type { ServiceContent } from "@/lib/services/types";

const requireAdminSessionMock = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdminSession: () => requireAdminSessionMock(),
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/services/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function minimalContent(heading: string): ServiceContent {
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

async function makeTestService() {
  return createService({
    slug: `test-edit-${Math.random().toString(36).slice(2, 8)}`,
    displayOrder: 50,
    isPublished: false,
    relatedPackageSlugs: [],
    content: { es: minimalContent("Original ES"), en: minimalContent("Original EN") },
  });
}

describe("POST /api/admin/services/[id]", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);
    const service = await makeTestService();
    const res = await POST(makeRequest({ displayOrder: 1 }), { params: Promise.resolve({ id: service.id }) });
    expect(res.status).toBe(401);
  });

  it("id inexistente → 404 not_found", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest({ displayOrder: 1 }), { params: Promise.resolve({ id: "no-existe" }) });
    expect(res.status).toBe(404);
  });

  it("edita el contenido — nunca toca slug aunque se envíe", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const service = await makeTestService();

    const res = await POST(
      makeRequest({
        content: { es: minimalContent("Editado ES"), en: minimalContent("Editado EN") },
        slug: "hackeado",
      }),
      { params: Promise.resolve({ id: service.id }) }
    );
    expect(res.status).toBe(200);

    const reloaded = await getServiceById(service.id);
    expect(reloaded?.content.es.heading).toBe("Editado ES");
    expect(reloaded?.slug).toBe(service.slug); // unchanged, schema strips it
  });

  it("includes vacío en un patch → 400 validation_failed", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const service = await makeTestService();
    const badContent = { ...minimalContent("x"), includes: [] };
    const res = await POST(makeRequest({ content: { es: badContent, en: badContent } }), {
      params: Promise.resolve({ id: service.id }),
    });
    expect(res.status).toBe(400);
  });
});
