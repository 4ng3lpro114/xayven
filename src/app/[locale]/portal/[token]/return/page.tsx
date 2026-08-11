import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import { PageIntro } from "@/components/ui/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/motion/Reveal";
import { getProjectByPortalToken } from "@/lib/db/paymentsStore";
import { getPaymentById } from "@/lib/db/paymentsStore";
import { reconcileTransaction, applyProviderStatus } from "@/lib/payments/service";
import { paypalProvider } from "@/lib/payments/providers/paypal";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, type Locale } from "@/lib/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } };
}

/**
 * Wompi and PayPal both redirect the browser back here after checkout —
 * but per Fase 6/17, this page NEVER trusts that redirect as proof of
 * anything. It re-verifies with the provider (Wompi: GET transaction by
 * id; PayPal: capture/GET order) and only displays whatever
 * applyProviderStatus's idempotent core actually persisted.
 */
export default async function PortalReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ id?: string; token?: string; paymentId?: string }>;
}) {
  const { locale: rawLocale, token: portalToken } = await params;
  const { id: wompiTransactionId, token: paypalOrderId, paymentId } = await searchParams;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const dict = await getDictionary(locale);

  const project = await getProjectByPortalToken(portalToken);
  const backHref = `/${locale}/portal/${portalToken}`;

  if (!project || !paymentId) {
    return (
      <Section spacing="tight" className="pt-24 text-center">
        <Container size="narrow">
          <h1 className="text-2xl font-semibold text-fg">{dict.portal.notFoundTitle}</h1>
          <p className="mt-3 text-fg-muted">{dict.portal.notFoundBody}</p>
        </Container>
      </Section>
    );
  }

  let payment = await getPaymentById(paymentId);

  if (payment?.provider === "WOMPI" && wompiTransactionId) {
    await reconcileTransaction("WOMPI", wompiTransactionId);
  } else if (payment?.provider === "PAYPAL" && paypalOrderId) {
    const captured = await paypalProvider.captureOrder(paypalOrderId);
    if (captured) {
      await applyProviderStatus({
        provider: "PAYPAL",
        providerTransactionId: captured.transactionId,
        reportedStatus: captured.status,
        reference: payment.reference,
        rawPayload: captured.raw,
      });
    }
  }
  // WISE: nothing to reconcile automatically — status only changes via
  // /admin manual confirmation.

  payment = payment ? ((await getPaymentById(payment.id)) ?? payment) : null;

  if (!payment) {
    return (
      <Section spacing="tight" className="pt-24 text-center">
        <Container size="narrow">
          <h1 className="text-2xl font-semibold text-fg">{dict.portal.returnHeadingError}</h1>
          <p className="mt-3 text-fg-muted">{dict.portal.returnBodyError}</p>
          <Link href={backHref} className="mt-6 inline-block text-sm text-accent-300 underline">
            {dict.portal.backToPortal}
          </Link>
        </Container>
      </Section>
    );
  }

  const presentation = {
    APPROVED: {
      icon: CheckCircle2,
      color: "text-success",
      heading: dict.portal.returnHeadingApproved,
      body: dict.portal.returnBodyApproved,
    },
    DECLINED: {
      icon: XCircle,
      color: "text-error",
      heading: dict.portal.returnHeadingDeclined,
      body: dict.portal.returnBodyDeclined,
    },
    PENDING: {
      icon: Clock,
      color: "text-fg-muted",
      heading: dict.portal.returnHeadingPending,
      body: dict.portal.returnBodyPending,
    },
    ERROR: {
      icon: AlertCircle,
      color: "text-error",
      heading: dict.portal.returnHeadingError,
      body: dict.portal.returnBodyError,
    },
    VOIDED: {
      icon: XCircle,
      color: "text-fg-muted",
      heading: dict.portal.returnHeadingDeclined,
      body: dict.portal.returnBodyDeclined,
    },
    REFUNDED: {
      icon: AlertCircle,
      color: "text-fg-muted",
      heading: dict.portal.returnHeadingError,
      body: dict.portal.returnBodyError,
    },
  }[payment.status];

  const Icon = presentation.icon;

  return (
    <>
      <PageIntro eyebrow={dict.portal.eyebrow} heading={presentation.heading} />
      <Section spacing="tight">
        <Container size="narrow">
          <Reveal>
            <div className="rounded-xl border border-border bg-bg-raised p-8 text-center">
              <Icon className={`mx-auto size-10 ${presentation.color}`} aria-hidden="true" />
              <p className="mt-4 text-base text-fg-muted">{presentation.body}</p>
              <p className="mt-4 font-mono text-xs text-fg-subtle">{payment.reference}</p>
              <Link
                href={backHref}
                className="mt-6 inline-block text-sm font-medium text-accent-300 underline"
              >
                {dict.portal.backToPortal}
              </Link>
            </div>
          </Reveal>
        </Container>
      </Section>
    </>
  );
}
