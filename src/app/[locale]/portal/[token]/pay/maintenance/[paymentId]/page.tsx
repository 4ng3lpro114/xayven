import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/ui/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/motion/Reveal";
import { CheckoutPanel } from "@/components/portal/CheckoutPanel";
import { getProjectByPortalToken, getClientById, getPaymentById } from "@/lib/db/paymentsStore";
import { buildCheckoutForExistingPayment } from "@/lib/payments/service";
import { formatMoney } from "@/lib/payments/format";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, type Locale } from "@/lib/i18n/config";
import { SITE_URL } from "@/lib/constants";

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } };
}

/** Payment link for an admin-created MAINTENANCE charge — see
 *  /admin/(protected)/projects/[id] "Add maintenance charge". */
export default async function MaintenancePayPage({
  params,
}: {
  params: Promise<{ locale: string; token: string; paymentId: string }>;
}) {
  const { locale: rawLocale, token, paymentId } = await params;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const dict = await getDictionary(locale);
  const backHref = `/${locale}/portal/${token}`;

  const project = await getProjectByPortalToken(token);
  const payment = project ? await getPaymentById(paymentId) : null;

  if (!project || !payment || payment.projectId !== project.id || payment.paymentType !== "MAINTENANCE") {
    return (
      <Section spacing="tight" className="pt-24 text-center">
        <Container size="narrow">
          <h1 className="text-2xl font-semibold text-fg">{dict.portal.notFoundTitle}</h1>
          <p className="mt-3 text-fg-muted">{dict.portal.notFoundBody}</p>
        </Container>
      </Section>
    );
  }

  if (payment.status !== "PENDING") {
    return (
      <Section spacing="tight" className="pt-24 text-center">
        <Container size="narrow">
          <p className="text-fg-muted">{dict.portal.errorAlreadyPaid}</p>
          <Link href={backHref} className="mt-4 inline-block text-sm text-accent-300 underline">
            {dict.portal.backToPortal}
          </Link>
        </Container>
      </Section>
    );
  }

  const client = await getClientById(payment.clientId);
  if (!client) {
    return (
      <Section spacing="tight" className="pt-24 text-center">
        <Container size="narrow">
          <p className="text-fg-muted">{dict.portal.errorGeneric}</p>
        </Container>
      </Section>
    );
  }

  let checkout: Awaited<ReturnType<typeof buildCheckoutForExistingPayment>> | null = null;
  try {
    checkout = await buildCheckoutForExistingPayment({ payment, project, client, siteUrl: SITE_URL, locale });
  } catch {
    return (
      <Section spacing="tight" className="pt-24 text-center">
        <Container size="narrow">
          <p className="text-fg-muted">{dict.portal.errorProviderNotConfigured}</p>
          <Link href={backHref} className="mt-4 inline-block text-sm text-accent-300 underline">
            {dict.portal.backToPortal}
          </Link>
        </Container>
      </Section>
    );
  }

  return (
    <>
      <PageIntro eyebrow={dict.portal.eyebrow} heading={dict.paymentTypeLabels.MAINTENANCE} />
      <Section spacing="tight">
        <Container size="narrow">
          <Reveal>
            <div className="rounded-xl border border-border-accent bg-bg-raised p-6 sm:p-8">
              <p className="text-sm text-fg-muted">{formatMoney(payment.amount, payment.currency)}</p>
              <CheckoutPanel
                checkout={checkout}
                continueLabel={dict.portal.continueToProvider}
                manualInstructionsTitle={dict.portal.manualInstructionsTitle}
                manualPendingNote={dict.portal.manualPendingNote}
              />
            </div>
            <Link href={backHref} className="mt-6 inline-block text-sm text-fg-subtle underline">
              {dict.portal.backToPortal}
            </Link>
          </Reveal>
        </Container>
      </Section>
    </>
  );
}
