import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { contactSchema } from "@/lib/validation";
import { getClientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * Contact form endpoint.
 *
 * This validates and accepts submissions today. Actual email delivery only
 * happens once RESEND_API_KEY + CONTACT_EMAIL_TO are configured (see
 * .env.example / README) — until then, submissions are logged server-side
 * only and are NOT persisted anywhere. This is documented deliberately
 * rather than faking a working inbox.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = rateLimit(`contact:ip:${ip}`, { limit: 10, windowMs: 10 * 60 * 1000 });
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

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
  }

  const { website, ...data } = parsed.data;
  if (website) {
    // Honeypot triggered — silently accept so the bot doesn't learn anything.
    return NextResponse.json({ ok: true });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_EMAIL_TO;
  const from = process.env.CONTACT_EMAIL_FROM ?? "XAYVEN <onboarding@resend.dev>";

  if (!apiKey || !to) {
    console.info("[contact] Received submission (email delivery not configured):", {
      name: data.name,
      email: data.email,
      company: data.company,
      projectType: data.projectType,
      budget: data.budget,
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
        subject: `Nuevo contacto — ${data.name}${data.company ? ` (${data.company})` : ""}`,
        text: [
          `Nombre: ${data.name}`,
          `Email: ${data.email}`,
          `Empresa: ${data.company || "—"}`,
          `Tipo de proyecto: ${data.projectType}`,
          `Presupuesto: ${data.budget}`,
          "",
          "Mensaje:",
          data.message,
        ].join("\n"),
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error("[contact] Resend API error:", errText);
      return NextResponse.json({ ok: false, error: "delivery_failed" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, delivered: true });
  } catch (error) {
    console.error("[contact] Unexpected error sending email:", error);
    return NextResponse.json({ ok: false, error: "delivery_failed" }, { status: 502 });
  }
}
