import { describe, it, expect } from "vitest";
import { buildAnalyticsFunnelStats } from "../aggregate";
import type { AnalyticsEvent } from "../types";

function makeEvent(overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  return {
    id: "evt-1",
    createdAt: "2026-08-17T00:00:00.000Z",
    eventType: "service_page_view",
    serviceSlug: null,
    packageSlug: null,
    sessionId: null,
    locale: "es",
    metadata: {},
    ...overrides,
  };
}

describe("buildAnalyticsFunnelStats", () => {
  it("countsByType arranca en 0 para los 7 tipos, incluso sin eventos", () => {
    const stats = buildAnalyticsFunnelStats([]);
    expect(Object.values(stats.countsByType).every((n) => n === 0)).toBe(true);
    expect(Object.keys(stats.countsByType)).toHaveLength(7);
  });

  it("cuenta correctamente por tipo de evento", () => {
    const events = [
      makeEvent({ eventType: "service_page_view" }),
      makeEvent({ eventType: "service_page_view" }),
      makeEvent({ eventType: "service_ai_cta" }),
    ];
    const stats = buildAnalyticsFunnelStats(events);
    expect(stats.countsByType.service_page_view).toBe(2);
    expect(stats.countsByType.service_ai_cta).toBe(1);
    expect(stats.countsByType.maintenance_cta).toBe(0);
  });

  it("topServicesByView agrupa por serviceSlug, ordenado descendente", () => {
    const events = [
      makeEvent({ eventType: "service_page_view", serviceSlug: "seo" }),
      makeEvent({ eventType: "service_page_view", serviceSlug: "seo" }),
      makeEvent({ eventType: "service_page_view", serviceSlug: "ecommerce" }),
    ];
    const stats = buildAnalyticsFunnelStats(events);
    expect(stats.topServicesByView).toEqual([
      { slug: "seo", count: 2 },
      { slug: "ecommerce", count: 1 },
    ]);
  });

  it("topPackagesByCta solo cuenta pricing_package_cta, no pricing_package_view", () => {
    const events = [
      makeEvent({ eventType: "pricing_package_cta", packageSlug: "start" }),
      makeEvent({ eventType: "pricing_package_view", packageSlug: "start" }),
    ];
    const stats = buildAnalyticsFunnelStats(events);
    expect(stats.topPackagesByCta).toEqual([{ slug: "start", count: 1 }]);
  });

  it("eventos sin slug no contaminan los rankings por slug", () => {
    const events = [makeEvent({ eventType: "service_page_view", serviceSlug: null })];
    const stats = buildAnalyticsFunnelStats(events);
    expect(stats.topServicesByView).toEqual([]);
    expect(stats.countsByType.service_page_view).toBe(1);
  });
});
