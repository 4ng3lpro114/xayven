import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/ui/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/motion/Reveal";
import { CheckoutPanel } from "@/components/portal/CheckoutPanel";
import { getProjectByPortalToken, getClientById } from "@/lib/db/paymentsStore";
import { initiateProjectPayment, PaymentAuthorizationError } from "@/lib/payments/service";
import { listConfiguredProviders } from "@/lib/payments/registry";
import { isPayPalCurrencySupported } from "@/lib/payments/providers/paypal";
import { formatMoney } from "@/lib/payments/format";
import { computeAllowedAmount } from "@/lib/payments/service";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, type Locale } from "@/lib/i18n/config";
import { SITE_URL } from "@/lib/constants";
import type { PaymentProviderName, PaymentType } from "@/lib/payments/types";

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } };
}

type ClientPayableType = Exclude<PaymentType, "MAINTENANCE">;
const VALID_TYPES: ClientPayableType[] = ["DEPOSIT", "BALANCE", "FULL_PAYMENT"];
const VALID_PROVIDERS: PaymentProviderName[] = ["WOMPI", "PAYPAL", "WISE"];

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string; type: string }>;
  searchParams: Promise<{ provider?: string }>;
}) {
  const { locale: rawLocale, token, type: rawType } = await params;
  const { provider: rawProvider } = await searchParams;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const dict = await getDictionary(locale);

  const project = await getProjectByPortalToken(token);
  if (!project) {
    return (
      <Section spacing="tight" className="pt-24 text-center">
        <Container size="narrow">
          <h1 className="text-2xl font-semibold text-fg">{dict.portal.notFoundTitle}</h1>
          <p className="mt-3 text-fg-muted">{dict.portal.notFoundBody}</p>
        </Container>
      </Section>
    );
  }

  const paymentType = VALID_TYPES.includes(rawType as ClientPayableType)
    ? (rawType as ClientPayableType)
    : null;
  const backHref = `/${locale}/portal/${token}`;

  if (!paymentType) {
    return <ErrorScreen dict={dict} message={dict.portal.errorGeneric} backHref={backHref} />;
  }

  const client = await getClientById(project.clientId);
  if (!client) {
    return <ErrorScreen dict={dict} message={dict.portal.errorGeneric} backHref={backHref} />;
  }

  let amountPreview: number | null = null;
  try {
    amountPreview = computeAllowedAmount(project, paymentType);
  } catch (error) {
    return (
      <ErrorScreen dict={dict} message={authErrorMessage(dict, error)} backHref={backHref} />
    );
  }

  // Step 1: no provider chosen yet — show the picker.
  if (!rawProvider) {
    const configured = new Set(listConfiguredProviders());
    const paypalCurrencyOk = isPayPalCurrencySupported(project.currency);

    // Each provider gets its OWN reason when unavailable — "not configured"
    // (an env var is missing) and "currency not supported" (PayPal + COP,
    // see docs/payments.md §4) are different situations and a client
    // shouldn't have to guess which one applies.
    const wompiUnavailableReason = !configured.has("WOMPI")
      ? dict.portal.providerUnavailableNotConfigured
      : null;
    const paypalUnavailableReason = !configured.has("PAYPAL")
      ? dict.portal.providerUnavailableNotConfigured
      : !paypalCurrencyOk
        ? dict.portal.providerUnavailableCurrency
        : null;

    return (
      <>
        <PageIntro
          eyebrow={dict.portal.eyebrow}
          heading={dict.portal.chooseProvider}
          description={`${dict.paymentTypeLabels[paymentType]} · ${formatMoney(amountPreview, project.currency)}`}
        />
        <Section spacing="tight">
          <Container size="narrow">
            <Reveal>
              <div className="grid gap-4 sm:grid-cols-3">
                <ProviderCard
                  href={`${backHref}/pay/${paymentType}?provider=WOMPI`}
                  title={dict.portal.providerWompi}
                  hint={dict.portal.providerWompiHint}
                  unavailableReason={wompiUnavailableReason}
                />
                <ProviderCard
                  href={`${backHref}/pay/${paymentType}?provider=PAYPAL`}
                  title={dict.portal.providerPaypal}
                  hint={dict.portal.providerPaypalHint}
                  unavailableReason={paypalUnavailableReason}
                />
                <ProviderCard
                  href={`${backHref}/pay/${paymentType}?provider=WISE`}
                  title={dict.portal.providerWise}
                  hint={dict.portal.providerWiseHint}
                  unavailableReason={null}
                />
              </div>
              <Link href={backHref} className="mt-8 inline-block text-sm text-fg-subtle underline">
                {dict.portal.backToPortal}
              </Link>
            </Reveal>
          </Container>
        </Section>
      </>
    );
  }

  const provider = VALID_PROVIDERS.includes(rawProvider as PaymentProviderName)
    ? (rawProvider as PaymentProviderName)
    : null;
  if (!provider) {
    return <ErrorScreen dict={dict} message={dict.portal.errorGeneric} backHref={backHref} />;
  }
  if (provider === "PAYPAL" && !isPayPalCurrencySupported(project.currency)) {
    return (
      <ErrorScreen dict={dict} message={dict.portal.errorProviderNotConfigured} backHref={backHref} />
    );
  }

  // Step 2: provider chosen — initiate (or resume) the checkout.
  let checkout: Awaited<ReturnType<typeof initiateProjectPayment>>["checkout"] | null = null;
  try {
    ({ checkout } = await initiateProjectPayment({
      project,
      client,
      paymentType,
      provider,
      siteUrl: SITE_URL,
      locale,
    }));
  } catch (error) {
    return <ErrorScreen dict={dict} message={authErrorMessage(dict, error)} backHref={backHref} />;
  }

  return (
    <>
      <PageIntro eyebrow={dict.portal.eyebrow} heading={dict.paymentTypeLabels[paymentType]} />
      <Section spacing="tight">
        <Container size="narrow">
          <Reveal>
            <div className="rounded-xl border border-border-accent bg-bg-raised p-6 sm:p-8">
              <p className="text-sm text-fg-muted">
                {formatMoney(amountPreview, project.currency)}
              </p>

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

function authErrorMessage(dict: Awaited<ReturnType<typeof getDictionary>>, error: unknown): string {
  if (error instanceof PaymentAuthorizationError) {
    switch (error.code) {
      case "project_fully_paid":
        return dict.portal.errorAlreadyPaid;
      case "deposit_already_paid":
        return dict.portal.errorDepositAlreadyPaid;
      case "no_deposit_yet":
        return dict.portal.errorNoDepositYet;
      case "partial_payment_exists":
        return dict.portal.errorPartialPaymentExists;
      case "provider_not_configured":
        return dict.portal.errorProviderNotConfigured;
    }
  }
  return dict.portal.errorGeneric;
}

function ErrorScreen({
  dict,
  message,
  backHref,
}: {
  dict: Awaited<ReturnType<typeof getDictionary>>;
  message: string;
  backHref: string;
}) {
  return (
    <Section spacing="tight" className="pt-24 text-center">
      <Container size="narrow">
        <p className="text-fg-muted">{message}</p>
        <Link href={backHref} className="mt-4 inline-block text-sm text-accent-300 underline">
          {dict.portal.backToPortal}
        </Link>
      </Container>
    </Section>
  );
}

function ProviderCard({
  href,
  title,
  hint,
  unavailableReason,
}: {
  href: string;
  title: string;
  hint: string;
  /** null = available. Non-null = unavailable, with the specific reason to
   *  show instead of the normal hint — see the two call sites above. */
  unavailableReason: string | null;
}) {
  if (unavailableReason) {
    return (
      <div className="rounded-lg border border-border bg-bg-elevated/50 p-5 opacity-50">
        <p className="text-sm font-semibold text-fg">{title}</p>
        <p className="mt-1 text-xs text-fg-subtle">{unavailableReason}</p>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="block rounded-lg border border-border bg-bg-raised p-5 transition-colors hover:border-border-accent"
    >
      <p className="text-sm font-semibold text-fg">{title}</p>
      <p className="mt-1 text-xs text-fg-muted">{hint}</p>
    </Link>
  );
}
