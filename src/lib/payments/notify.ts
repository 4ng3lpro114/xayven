import "server-only";
import type { Client, Payment, Project } from "@/lib/payments/types";

/**
 * Payment email notifications — reuses the exact Resend `fetch` pattern
 * already used by /api/contact and /api/maintenance. Same honest fallback:
 * without RESEND_API_KEY / CONTACT_EMAIL_TO, this just logs instead of
 * throwing, so a missing email config never breaks payment processing.
 *
 * Callers (src/lib/payments/service.ts) only invoke these from inside the
 * idempotency-guarded transition — i.e. at most once per real status
 * change, never once per webhook delivery.
 */

async function sendEmail(params: { to: string; subject: string; text: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_EMAIL_FROM ?? "XAYVEN <onboarding@resend.dev>";

  if (!apiKey) {
    console.info("[payments/notify] Email delivery not configured, skipping:", {
      to: params.to,
      subject: params.subject,
    });
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [params.to], subject: params.subject, text: params.text }),
    });
    if (!res.ok) {
      console.error("[payments/notify] Resend API error:", await res.text());
    }
  } catch (error) {
    console.error("[payments/notify] Unexpected error sending email:", error);
  }
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
