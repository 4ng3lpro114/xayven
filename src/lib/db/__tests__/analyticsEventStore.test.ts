import { describe, it, expect } from "vitest";
import { recordAnalyticsEvent, listAnalyticsEvents } from "@/lib/db/analyticsEventStore";

describe("analyticsEventStore (Analytics Phase 7)", () => {
  it("recordAnalyticsEvent nunca lanza, incluso con un input mínimo", async () => {
    await expect(
      recordAnalyticsEvent({
        eventType: "service_page_view",
        serviceSlug: "seo",
        packageSlug: null,
        sessionId: null,
        locale: "es",
        metadata: {},
      })
    ).resolves.toBeUndefined();
  });

  it("un evento registrado aparece en listAnalyticsEvents con los campos correctos", async () => {
    await recordAnalyticsEvent({
      eventType: "pricing_package_cta",
      serviceSlug: null,
      packageSlug: "start",
      sessionId: "session-abc",
      locale: "en",
      metadata: {},
    });

    const events = await listAnalyticsEvents({ limit: 5000 });
    const found = events.find((e) => e.packageSlug === "start" && e.eventType === "pricing_package_cta");
    expect(found).toBeDefined();
    expect(found?.sessionId).toBe("session-abc");
    expect(found?.locale).toBe("en");
    expect(found?.id).toBeTruthy();
    expect(found?.createdAt).toBeTruthy();
  });

  it("listAnalyticsEvents respeta el límite", async () => {
    for (let i = 0; i < 5; i++) {
      await recordAnalyticsEvent({
        eventType: "maintenance_cta",
        serviceSlug: null,
        packageSlug: null,
        sessionId: null,
        locale: null,
        metadata: {},
      });
    }
    const events = await listAnalyticsEvents({ limit: 3 });
    expect(events.length).toBeLessThanOrEqual(3);
  });
});
