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
  return new NextRequest("http://localhost/api/admin/services/x/status", {
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

async function makeTestService(isPublished = false) {
  return createService({
    slug: `test-status-${Math.random().toString(36).slice(2, 8)}`,
    displayOrder: 50,
    isPublished,
    relatedPackageSlugs: [],
    content: { es: minimalContent("ES"), en: minimalContent("EN") },
  });
}

describe("POST /api/admin/services/[id]/status", () => {
  beforeEach(() => {
    requireAdminSessionMock.mockReset();
  });

  it("usuario no autorizado → 401", async () => {
    requireAdminSessionMock.mockResolvedValue(false);
    const service = await makeTestService();
    const res = await POST(makeRequest({ action: "publish" }), { params: Promise.resolve({ id: service.id }) });
    expect(res.status).toBe(401);
  });

  it("action='publish' → isPublished queda true", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const service = await makeTestService(false);
    const res = await POST(makeRequest({ action: "publish" }), { params: Promise.resolve({ id: service.id }) });
    expect(res.status).toBe(200);
    const reloaded = await getServiceById(service.id);
    expect(reloaded?.isPublished).toBe(true);
  });

  it("action='unpublish' → isPublished queda false", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const service = await makeTestService(true);
    const res = await POST(makeRequest({ action: "unpublish" }), { params: Promise.resolve({ id: service.id }) });
    expect(res.status).toBe(200);
    const reloaded = await getServiceById(service.id);
    expect(reloaded?.isPublished).toBe(false);
  });

  it("id inexistente → 404 not_found", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const res = await POST(makeRequest({ action: "publish" }), { params: Promise.resolve({ id: "no-existe" }) });
    expect(res.status).toBe(404);
  });

  it("action inválido → 400 validation_failed", async () => {
    requireAdminSessionMock.mockResolvedValue(true);
    const service = await makeTestService();
    const res = await POST(makeRequest({ action: "delete" }), { params: Promise.resolve({ id: service.id }) });
    expect(res.status).toBe(400);
  });
});
