import "server-only";
import { sendEmail as sendEmailShared } from "@/lib/email/send";
import type { Client, Payment, Project } from "@/lib/payments/types";

/**
 * Payment email notifications — XAYVEN CORE Phase 3.3: now built on the
 * single shared `sendEmail()` (src/lib/email/send.ts) instead of its own
 * copy of the Resend `fetch` call — the module doc comment there explains
 * why the triplication existed and what it cost (only two of the three
 * call sites ever set `reply_to`, this one being the odd one out).
 *
 * Same honest fallback as before: without RESEND_API_KEY / CONTACT_EMAIL_TO,
 * this just logs instead of throwing, so a missing email config never
 * breaks payment processing.
 *
 * Callers (src/lib/payments/service.ts) only invoke these from inside the
 * idempotency-guarded transition — i.e. at most once per real status
 * change, never once per webhook delivery.
 */

async function sendEmail(params: { to: string; subject: string; text: string; replyTo?: string }): Promise<void> {
  const result = await sendEmailShared(params);
  if (result.ok) return;

  if (result.reason === "not_configured") {
    console.info("[payments/notify] Email delivery not configured, skipping:", {
      to: params.to,
      subject: params.subject,
    });
    return;
  }
  if (result.reason === "provider_error") {
    console.error("[payments/notify] Resend API error:", result.detail);
    return;
  }
  console.error("[payments/notify] Unexpected error sending email:", result.detail);
}

function money(amount: number, currency: string): string {
  return `${amount.toLocaleString("es-CO")} ${currency}`;
}

export async function notifyPaymentApproved(payment: Payment, project: Project, client: Client) {
  const adminTo = process.env.CONTACT_EMAIL_TO;

  await sendEmail({
    to: client.email,
    subject: "Tu pago fue recibido — XAYVEN",
    text: [
      `Hola ${client.name},`,
      "",
      "Tu pago fue recibido correctamente.",
      "",
      `Proyecto: ${project.name}`,
      `Monto: ${money(payment.amount, payment.currency)}`,
      `Referencia: ${payment.reference}`,
      "",
      "Gracias por confiar en XAYVEN.",
    ].join("\n"),
  });

  if (adminTo) {
    await sendEmail({
      to: adminTo,
      // XAYVEN CORE Phase 3.3 — lets the admin reply straight to the
      // client from this notification, same convenience Contact/
      // Maintenance already had; `from` stays hello@xayven.com, this
      // only affects where a reply goes.
      replyTo: client.email,
      subject: `Nuevo pago recibido — ${project.name}`,
      text: [
        `Cliente: ${client.name} (${client.email})`,
        `Proyecto: ${project.name}`,
        `Proveedor: ${payment.provider}`,
        `Tipo: ${payment.paymentType}`,
        `Monto: ${money(payment.amount, payment.currency)}`,
        `Referencia: ${payment.reference}`,
        `ID de transacción: ${payment.providerTransactionId ?? "—"}`,
      ].join("\n"),
    });
  }
}

export async function notifyPaymentDeclined(payment: Payment, project: Project, client: Client) {
  await sendEmail({
    to: client.email,
    subject: "No pudimos completar tu pago — XAYVEN",
    text: [
      `Hola ${client.name},`,
      "",
      "No pudimos completar tu pago. Puedes intentarlo de nuevo desde tu área de proyecto,",
      "o escribirnos si el problema persiste.",
      "",
      `Proyecto: ${project.name}`,
      `Referencia: ${payment.reference}`,
    ].join("\n"),
  });
}
