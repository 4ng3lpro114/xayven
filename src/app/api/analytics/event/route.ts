import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { trackEventSchema } from "@/lib/analytics/validation";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { recordAnalyticsEvent } from "@/lib/db/analyticsEventStore";

export const runtime = "nodejs";

/**
 * Analytics Phase 7 — public, unauthenticated event-tracking endpoint.
 * Same public+rate-limited shape as /api/contact and /api/ai/chat (the
 * only other routes anonymous visitors can POST to), but simpler: no
 * persistence-vs-email distinction, no honeypot (nothing here is
 * spam-attractive), no lead data. Always responds fast and never
 * reflects back whether the underlying write actually landed —
 * tracking is fire-and-forget by design (see analyticsEventStore.ts's
 * own doc comment for why this is the one deliberate exception to this
 * codebase's "never swallow a write error" rule).
 *
 * Metadata is deliberately NEVER accepted from the client — only the
 * closed `eventType` enum plus slug/session/locale fields the schema
 * validates. Nothing free-form from a visitor's browser ever reaches
 * this table.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = rateLimit(`analytics-event:ip:${ip}`, { limit: 120, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    // Never a hard failure the visitor could notice — tracking is
    // invisible by nature. Still return a real status so a well-behaved
    // client can back off.
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = trackEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  await recordAnalyticsEvent({
    eventType: parsed.data.eventType,
    serviceSlug: parsed.data.serviceSlug ?? null,
    packageSlug: parsed.data.packageSlug ?? null,
    sessionId: parsed.data.sessionId ?? null,
    locale: parsed.data.locale ?? null,
    metadata: {},
  });

  return NextResponse.json({ ok: true });
}
