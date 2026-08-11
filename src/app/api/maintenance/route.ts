import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { maintenanceSchema } from "@/lib/validation";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { createMaintenanceRequest } from "@/lib/db/maintenanceStore";

export const runtime = "nodejs";

/**
 * Maintenance request endpoint — same pattern as /api/contact (validate,
 * honeypot, best-effort email via Resend if configured), plus persistence
 * via maintenanceStore (Supabase if configured, in-memory fallback
 * otherwise) so requests show up for the team even without email set up.
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

  const record = await createMaintenanceRequest({
    name: data.name,
    email: data.email,
    company: data.company || null,
    website: data.website,
    need: data.need,
    priority: data.priority,
    message: data.message,
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
