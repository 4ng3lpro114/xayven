import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { maintenanceSchema } from "@/lib/validation";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { createMaintenanceRequest } from "@/lib/db/maintenanceStore";
import { getClientByNormalizedEmail } from "@/lib/db/paymentsStore";

export const runtime = "nodejs";

/**
 * Maintenance request endpoint — same pattern as /api/contact (validate,
 * honeypot, best-effort email via Resend if configured), plus persistence
 * via maintenanceStore (Supabase if configured, in-memory fallback
 * otherwise) so requests show up for the team even without email set up.
 *
 * XAYVEN CORE Phase 2 — best-effort client linking. Resolved server-side
 * ONLY, via the exact same normalized-email lookup
 * (getClientByNormalizedEmail) the lead/contact-request conversion flows
 * already use — never a client-supplied value. Deliberately NEVER creates
 * a client: someone can request maintenance before ever becoming a
 * commercial client (or under a different email than the one on file), so
 * an unmatched email is not an error. The lookup is wrapped so it can
 * never block or fail the actual submission — any recoverable failure
 * (Supabase hiccup, etc.) just leaves clientId null, exactly like "no
 * match found".
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = rateLimit(`maintenance:ip:${ip}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = maintenanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  const { hp, ...data } = parsed.data;
  if (hp) {
    // Honeypot triggered — silently accept so the bot doesn't learn anything.
    return NextResponse.json({ ok: true });
  }

  let clientId: string | null = null;
  try {
    const normalizedEmail = data.email.trim().toLowerCase();
    const existingClient = await getClientByNormalizedEmail(normalizedEmail);
    clientId = existingClient?.id ?? null;
  } catch (error) {
    // Best-effort only — see the module doc comment. Never blocks the
    // submission below.
    console.error("[maintenance] Client lookup failed (non-blocking):", error);
  }

  const record = await createMaintenanceRequest({
    name: data.name,
    email: data.email,
    company: data.company || null,
    website: data.website,
    need: data.need,
    priority: data.priority,
    message: data.message,
    clientId,
  });

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_EMAIL_TO;
  const from = process.env.CONTACT_EMAIL_FROM ?? "XAYVEN <onboarding@resend.dev>";

  if (!apiKey || !to) {
    console.info("[maintenance] Received request (email delivery not configured):", {
      id: record.id,
      name: data.name,
      email: data.email,
      need: data.need,
      priority: data.priority,
    });
    return NextResponse.json({ ok: true, delivered: false });
  }

  try {
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: data.email,
        subject: `Mantenimiento — ${data.name}${data.company ? ` (${data.company})` : ""}`,
        text: [
          `Nombre: ${data.name}`,
          `Email: ${data.email}`,
          `Empresa: ${data.company || "—"}`,
          `Web: ${data.website}`,
          `Necesidad: ${data.need}`,
          `Prioridad: ${data.priority}`,
          "",
          "Mensaje:",
          data.message,
        ].join("\n"),
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error("[maintenance] Resend API error:", errText);
      // The request is already persisted above, so this is a delivery-only
      // failure — still tell the visitor it was received.
      return NextResponse.json({ ok: true, delivered: false });
    }

    return NextResponse.json({ ok: true, delivered: true });
  } catch (error) {
    console.error("[maintenance] Unexpected error sending email:", error);
    return NextResponse.json({ ok: true, delivered: false });
  }
}
