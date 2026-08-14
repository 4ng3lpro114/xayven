import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { contactSchema } from "@/lib/validation";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { createContactRequest } from "@/lib/db/contactRequestStore";
import { logContactEvent } from "@/lib/contact/log";

export const runtime = "nodejs";

/**
 * Contact form endpoint — backs the public "Crear mi proyecto" CTA
 * (nav/Hero/FinalCTA all link to /contact).
 *
 * Fixed here: every valid submission is now persisted to `contact_requests`
 * BEFORE any attempt to email the admin, and stays visible in
 * /admin/contact-requests regardless of what happens to that email. Before
 * this fix, submissions were never persisted anywhere — if CONTACT_EMAIL_TO
 * wasn't configured (as was the case in production), the visitor still saw
 * a success message (HTTP 200, frontend only checked res.ok) while the
 * request vanished with nothing but a console.info to show for it. See the
 * "Crear mi proyecto" incident diagnosis for the full trace.
 *
 * The response now distinguishes `persisted` (did we actually save it?)
 * from `emailSent` (did the admin notification go out?) — the frontend
 * must only show success when `persisted` is true, and must never claim
 * the email was sent when it wasn't.
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
    // Honeypot triggered — silently accept so the bot doesn't learn
    // anything. Deliberately not persisted, not logged: same behavior as
    // before this fix, unrelated to the incident this change addresses.
    return NextResponse.json({ ok: true, persisted: false, emailSent: false });
  }

  logContactEvent("CONTACT_RECEIVED", { email: data.email });

  let contactRequest: Awaited<ReturnType<typeof createContactRequest>>;
  try {
    contactRequest = await createContactRequest({
      name: data.name,
      email: data.email,
      company: data.company ? data.company : null,
      projectType: data.projectType,
      budget: data.budget,
      message: data.message,
    });
  } catch (error) {
    // Never claim success when the request was never actually saved — see
    // the module doc comment. This is the one branch that must return an
    // error status; every other branch below has already secured the
    // request in the database.
    logContactEvent("CONTACT_INTERNAL_ERROR", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false, error: "persist_failed" }, { status: 500 });
  }

  logContactEvent("CONTACT_PERSISTED", { email: data.email });

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_EMAIL_TO;
  const from = process.env.CONTACT_EMAIL_FROM ?? "XAYVEN <onboarding@resend.dev>";

  if (!apiKey || !to) {
    logContactEvent("CONTACT_EMAIL_FAILED", { reason: "not_configured" });
    return NextResponse.json({ ok: true, persisted: true, emailSent: false });
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
          `Fecha/hora de recepción: ${new Date(contactRequest.createdAt).toLocaleString("es-CO")}`,
          "",
          "Mensaje:",
          data.message,
        ].join("\n"),
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      logContactEvent("CONTACT_EMAIL_FAILED", { reason: "resend_error", status: emailRes.status });
      console.error("[contact] Resend API error:", errText);
      // The request is already persisted above — a delivery-only failure
      // must never be reported as if the request itself was lost.
      return NextResponse.json({ ok: true, persisted: true, emailSent: false });
    }

    logContactEvent("CONTACT_EMAIL_SENT", { email: data.email });
    return NextResponse.json({ ok: true, persisted: true, emailSent: true });
  } catch (error) {
    logContactEvent("CONTACT_EMAIL_FAILED", { reason: "unexpected_error" });
    console.error("[contact] Unexpected error sending email:", error);
    return NextResponse.json({ ok: true, persisted: true, emailSent: false });
  }
}
