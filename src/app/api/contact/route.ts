import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { contactSchema } from "@/lib/validation";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { createContactRequest } from "@/lib/db/contactRequestStore";
import { getPricingCatalogItemBySlug } from "@/lib/db/pricingCatalogStore";
import { logContactEvent } from "@/lib/contact/log";
import { resolveCommercialMarket, resolveDisplayCurrency } from "@/lib/pricing/commercialContext";
import { resolveOfficialPrice } from "@/lib/pricing/resolveOfficialPrice";
import { withDisplayPrice } from "@/lib/pricing/displayPrice";
import { sendEmail } from "@/lib/email/send";
import { formatMoney } from "@/lib/payments/format";
import { SITE_URL } from "@/lib/constants";

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

  const { website, plan, ...data } = parsed.data;
  if (website) {
    // Honeypot triggered — silently accept so the bot doesn't learn
    // anything. Deliberately not persisted, not logged: same behavior as
    // before this fix, unrelated to the incident this change addresses.
    return NextResponse.json({ ok: true, persisted: false, emailSent: false });
  }

  logContactEvent("CONTACT_RECEIVED", { email: data.email });

  // Fase 2 — Pricing Core → Project Request. `plan` is a raw, client-
  // supplied slug — never trusted directly (same discipline as
  // resolveActivePromotion() in /api/ai/chat/route.ts). Resolve it against
  // the real, active catalog here; anything that doesn't resolve (absent,
  // unknown slug, or a slug that's since been deactivated) silently
  // becomes `null` rather than a validation error — Flujo B/C (no plan)
  // is a normal, expected case, not a failure.
  let pricingCatalogId: string | null = null;
  if (plan) {
    const catalogItem = await getPricingCatalogItemBySlug(plan);
    if (catalogItem && catalogItem.isActive) {
      pricingCatalogId = catalogItem.id;
    }
  }

  // XAYVEN CORE Phase 1 — Capture Commercial Context. Same resolvers
  // /api/ai/chat/route.ts already uses to answer pricing questions —
  // never a client-supplied market/currency/price. `marketCode`/
  // `displayCurrency` are captured whenever a market resolves, regardless
  // of whether a package was selected; `officialAmount`/`officialCurrency`
  // only when `plan` resolved to a real, active catalog item AND Pricing
  // Core actually had a number to show (never fabricated — same "null
  // means nothing to show" discipline as resolveOfficialPrice() itself).
  // withDisplayPrice() is reused as-is: it already resolves EUR↔USD via
  // the sibling market's own explicit price (never exchange_rates) when
  // one exists, exactly the anti-arbitrage behavior already audited —
  // nothing about that logic is duplicated or reimplemented here.
  const { market } = await resolveCommercialMarket();
  const { currency: displayCurrency } = await resolveDisplayCurrency(market);

  let officialAmount: number | null = null;
  let officialCurrency: string | null = null;
  if (pricingCatalogId && plan) {
    const official = await resolveOfficialPrice({ itemSlug: plan, market: market.code });
    const displayed = await withDisplayPrice(official, displayCurrency);
    if (displayed.amount !== null) {
      officialAmount = displayed.amount;
      officialCurrency = displayed.currency;
    }
  }

  let contactRequest: Awaited<ReturnType<typeof createContactRequest>>;
  try {
    contactRequest = await createContactRequest({
      name: data.name,
      email: data.email,
      company: data.company ? data.company : null,
      projectType: data.projectType,
      budget: data.budget,
      message: data.message,
      pricingCatalogId,
      marketCode: market.code,
      displayCurrency,
      officialAmount,
      officialCurrency,
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

  const to = process.env.CONTACT_EMAIL_TO;
  if (!to) {
    logContactEvent("CONTACT_EMAIL_FAILED", { reason: "not_configured" });
    return NextResponse.json({ ok: true, persisted: true, emailSent: false });
  }

  // XAYVEN CORE Phase 3.3 — enriched with fields that were already
  // captured/persisted above (market, display currency, official price
  // when one resolved, the request's own id) but never surfaced in the
  // notification before this phase. Nothing here is invented: every line
  // reads straight off `contactRequest`/`market`/`displayCurrency`.
  const result = await sendEmail({
    to,
    replyTo: data.email,
    subject: `Nuevo contacto — ${data.name}${data.company ? ` (${data.company})` : ""}`,
    text: [
      `Nombre: ${data.name}`,
      `Email: ${data.email}`,
      `Empresa: ${data.company || "—"}`,
      `Tipo de proyecto: ${data.projectType}`,
      `Presupuesto: ${data.budget}`,
      `Mercado: ${market.code}`,
      `Moneda mostrada: ${displayCurrency}`,
      `Precio oficial: ${officialAmount !== null && officialCurrency ? formatMoney(officialAmount, officialCurrency) : "—"}`,
      `Referencia: ${contactRequest.id}`,
      `Fecha/hora de recepción: ${new Date(contactRequest.createdAt).toLocaleString("es-CO")}`,
      "",
      "Mensaje:",
      data.message,
      "",
      `Ver en Admin: ${SITE_URL}/admin/contact-requests/${contactRequest.id}`,
    ].join("\n"),
  });

  if (!result.ok) {
    logContactEvent("CONTACT_EMAIL_FAILED", {
      reason: result.reason === "provider_error" ? "resend_error" : result.reason,
    });
    if (result.reason === "provider_error") {
      console.error("[contact] Resend API error:", result.detail);
    } else if (result.reason === "unexpected_error") {
      console.error("[contact] Unexpected error sending email:", result.detail);
    }
    // The request is already persisted above — a delivery-only failure
    // must never be reported as if the request itself was lost.
    return NextResponse.json({ ok: true, persisted: true, emailSent: false });
  }

  logContactEvent("CONTACT_EMAIL_SENT", { email: data.email });
  return NextResponse.json({ ok: true, persisted: true, emailSent: true });
}
