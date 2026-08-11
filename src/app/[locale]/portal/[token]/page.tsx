import type { Metadata } from "next";
import { PageIntro } from "@/components/ui/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/motion/Reveal";
import { PaymentStatusBadge } from "@/components/payments/PaymentStatusBadge";
import { getProjectByPortalToken, getClientById } from "@/lib/db/paymentsStore";
import { listPayments } from "@/lib/db/paymentsStore";
import { pendingAmount } from "@/lib/payments/types";
import { formatMoney, paymentStatusLabel } from "@/lib/payments/format";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, type Locale } from "@/lib/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  // Never indexed — this is a private capability URL, not public content.
  return { robots: { index: false, follow: false } };
}

export default async function PortalPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale: rawLocale, token } = await params;
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

  const [client, payments] = await Promise.all([
    getClientById(project.clientId),
    listPayments({ projectId: project.id }),
  ]);

  const pending = pendingAmount(project);
  const canPayDeposit = project.paidAmount === 0 && pending > 0;
  const canPayFull = project.paidAmount === 0 && pending > 0;
  const canPayBalance = project.paidAmount > 0 && pending > 0;
  const pendingMaintenance = payments.filter(
    (p) => p.paymentType === "MAINTENANCE" && p.status === "PENDING"
  );

  return (
    <>
      <PageIntro eyebrow={dict.portal.eyebrow} heading={project.name} />

      <Section spacing="tight">
        <Container size="narrow">
          <Reveal>
            <div className="rounded-xl border border-border-accent bg-bg-raised p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-fg-muted">{client?.name}</p>
                <PaymentStatusBadge
                  status={project.paidAmount >= project.totalAmount ? "APPROVED" : "PENDING"}
                  label={dict.portal.status + ": " + project.status}
                />
              </div>

              <div className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-6">
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">
                    {dict.portal.total}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-fg">
                    {formatMoney(project.totalAmount, project.currency)}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">
                    {dict.portal.paid}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-accent-300">
                    {formatMoney(project.paidAmount, project.currency)}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">
                    {dict.portal.pending}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-fg">
                    {formatMoney(pending, project.currency)}
                  </p>
                </div>
              </div>

              {pending <= 0 ? (
                <p className="mt-6 text-sm text-accent-300">{dict.portal.fullyPaid}</p>
              ) : (
                <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-6">
                  {canPayDeposit && (
                    <Button href={`/${locale}/portal/${token}/pay/DEPOSIT`} withArrow>
                      {dict.portal.payDeposit}
                    </Button>
                  )}
                  {canPayBalance && (
                    <Button href={`/${locale}/portal/${token}/pay/BALANCE`} withArrow>
                      {dict.portal.payBalance}
                    </Button>
                  )}
                  {canPayFull && (
                    <Button
                      href={`/${locale}/portal/${token}/pay/FULL_PAYMENT`}
                      variant="secondary"
                    >
                      {dict.portal.payFull}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Reveal>

          {pendingMaintenance.length > 0 && (
            <Reveal delay={0.05} className="mt-6 space-y-3">
              {pendingMaintenance.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-strong bg-bg-elevated/50 px-5 py-4"
                >
                  <div>
                    <p className="text-sm font-medium text-fg">{dict.paymentTypeLabels.MAINTENANCE}</p>
                    <p className="text-xs text-fg-subtle">{formatMoney(p.amount, p.currency)}</p>
                  </div>
                  <Button href={`/${locale}/portal/${token}/pay/maintenance/${p.id}`} size="md">
                    {dict.portal.continueToProvider}
                  </Button>
                </div>
              ))}
            </Reveal>
          )}
        </Container>
      </Section>

      <Section divider spacing="tight">
        <Container size="narrow">
          <h2 className="text-base font-semibold text-fg">{dict.portal.history}</h2>

          {payments.length === 0 ? (
            <p className="mt-4 text-sm text-fg-subtle">{dict.portal.historyEmpty}</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                    <th className="px-4 py-3 font-medium">{dict.portal.tableDate}</th>
                    <th className="px-4 py-3 font-medium">{dict.portal.tableProvider}</th>
                    <th className="px-4 py-3 font-medium">{dict.portal.tableAmount}</th>
                    <th className="px-4 py-3 font-medium">{dict.portal.tableReference}</th>
                    <th className="px-4 py-3 font-medium">{dict.portal.tableStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-fg-subtle">
                        {new Date(p.createdAt).toLocaleDateString(locale === "es" ? "es-CO" : "en-US")}
                      </td>
                      <td className="px-4 py-3 text-fg-muted">{p.provider}</td>
                      <td className="px-4 py-3 text-fg">{formatMoney(p.amount, p.currency)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-fg-subtle">{p.reference}</td>
                      <td className="px-4 py-3">
                        <PaymentStatusBadge status={p.status} label={paymentStatusLabel(dict.portal, p.status)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Container>
      </Section>
    </>
  );
}
