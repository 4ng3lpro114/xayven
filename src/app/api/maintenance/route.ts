import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { maintenanceSchema } from "@/lib/validation";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { createMaintenanceRequest } from "@/lib/db/maintenanceStore";
import { getClientByNormalizedEmail } from "@/lib/db/paymentsStore";
import { sendEmail } from "@/lib/email/send";
import { logMaintenanceEvent } from "@/lib/maintenance/log";
import { SITE_URL } from "@/lib/constants";

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
 *
 * XAYVEN CORE Phase 3.3 (Communication Audit) — three changes, all
 * response-shape/observability, zero business logic touched:
 *   1. `createMaintenanceRequest` is now wrapped in try/catch. In
 *      practice this store never throws under a configured-Supabase
 *      write failure (it fails open to memory instead — see
 *      maintenanceStore.ts, which now also logs that fallback, the real
 *      gap the audit found). This try/catch is deliberately defensive
 *      for the genuinely-unexpected case (not a behavior change to the
 *      store's own fail-open design), and brings this route's shape in
 *      line with /api/contact's `persist_failed` handling.
 *   2. The response contract now matches /api/contact's exactly —
 *      `{ ok, persisted, emailSent }` instead of the old `{ ok,
 *      delivered }`. Confirmed safe: MaintenanceForm.tsx (the only
 *      consumer) only ever reads `res.ok`, never the old `delivered`
 *      field, so this is not a breaking change to the public form.
 *   3. The admin notification email now includes status and
 *      client-match info (both already persisted, neither invented) and
 *      a direct link to the record in /admin/maintenance.
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

  logMaintenanceEvent("MAINTENANCE_RECEIVED", { email: data.email });

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

  let record: Awaited<ReturnType<typeof createMaintenanceRequest>>;
  try {
    record = await createMaintenanceRequest({
      name: data.name,
      email: data.email,
      company: data.company || null,
      website: data.website,
      need: data.need,
      priority: data.priority,
      message: data.message,
      clientId,
    });
  } catch (error) {
    // maintenanceStore.createMaintenanceRequest() fails open to memory on
    // a Supabase write error and does not throw for that case — this
    // branch is defensive coverage for a genuinely unexpected failure
    // (e.g. the store itself throwing), mirroring /api/contact's
    // persist_failed handling rather than letting an uncaught exception
    // fall through to a generic framework 500.
    logMaintenanceEvent("MAINTENANCE_INTERNAL_ERROR", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false, error: "persist_failed" }, { status: 500 });
  }

  logMaintenanceEvent("MAINTENANCE_PERSISTED", { id: record.id, email: data.email });

  const adminTo = process.env.CONTACT_EMAIL_TO;
  if (!adminTo) {
    logMaintenanceEvent("MAINTENANCE_EMAIL_FAILED", { reason: "not_configured" });
    return NextResponse.json({ ok: true, persisted: true, emailSent: false });
  }

  const result = await sendEmail({
    to: adminTo,
    replyTo: data.email,
    subject: `Mantenimiento — ${data.name}${data.company ? ` (${data.company})` : ""}`,
    text: [
      `Nombre: ${data.name}`,
      `Email: ${data.email}`,
      `Empresa: ${data.company || "—"}`,
      `Web: ${data.website}`,
      `Necesidad: ${data.need}`,
      `Prioridad: ${data.priority}`,
      `Estado: ${record.status}`,
      `Cliente existente: ${record.clientId ? "sí" : "no"}`,
      `Referencia: ${record.id}`,
      "",
      "Mensaje:",
      data.message,
      "",
      `Ver en Admin: ${SITE_URL}/admin/maintenance/${record.id}`,
    ].join("\n"),
  });

  if (!result.ok) {
    logMaintenanceEvent("MAINTENANCE_EMAIL_FAILED", { reason: result.reason });
    if (result.reason === "provider_error") {
      console.error("[maintenance] Resend API error:", result.detail);
    } else if (result.reason === "unexpected_error") {
      console.error("[maintenance] Unexpected error sending email:", result.detail);
    }
    // The request is already persisted above — a delivery-only failure
    // must never be reported as if the request itself was lost.
    return NextResponse.json({ ok: true, persisted: true, emailSent: false });
  }

  logMaintenanceEvent("MAINTENANCE_EMAIL_SENT", { id: record.id });
  return NextResponse.json({ ok: true, persisted: true, emailSent: true });
}
