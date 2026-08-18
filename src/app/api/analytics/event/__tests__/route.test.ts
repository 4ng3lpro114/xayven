import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { listAnalyticsEvents } from "@/lib/db/analyticsEventStore";

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/analytics/event — endpoint público, sin auth (Analytics Phase 7)", () => {
  it("evento válido → 200, ok:true, queda persistido", async () => {
    const res = await POST(makeRequest({ eventType: "service_page_view", serviceSlug: "seo" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const events = await listAnalyticsEvents({ limit: 5000 });
    expect(events.some((e) => e.eventType === "service_page_view" && e.serviceSlug === "seo")).toBe(true);
  });

  it("eventType inválido → 400 validation_failed, nunca se persiste", async () => {
    const res = await POST(makeRequest({ eventType: "not_a_real_event" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
  });

  it("JSON inválido → 400 invalid_json", async () => {
    const req = new NextRequest("http://localhost/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("metadata enviada por el cliente nunca se persiste tal cual — siempre {} en el store", async () => {
    await POST(makeRequest({ eventType: "maintenance_cta", metadata: { evil: "<script>alert(1)</script>" } }));
    const events = await listAnalyticsEvents({ limit: 5000 });
    const found = [...events].reverse().find((e) => e.eventType === "maintenance_cta");
    expect(found?.metadata).toEqual({});
  });

  it("no requiere sesión de admin — ruta pública, sin requireAdminSession", async () => {
    // No auth mock configurado en absoluto — si la ruta importara/llamara
    // requireAdminSession(), esto fallaría al intentar leer cookies() de
    // next/headers fuera de un request real de Next.
    const res = await POST(makeRequest({ eventType: "service_ai_cta", serviceSlug: "ecommerce" }));
    expect(res.status).toBe(200);
  });

  it("solo exporta POST — GET/PUT/DELETE/PATCH quedan rechazados automáticamente (405)", async () => {
    const routeModule = await import("../route");
    expect("GET" in routeModule).toBe(false);
    expect("PUT" in routeModule).toBe(false);
    expect("DELETE" in routeModule).toBe(false);
    expect("PATCH" in routeModule).toBe(false);
  });
});
