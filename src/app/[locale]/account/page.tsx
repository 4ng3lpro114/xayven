import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageIntro } from "@/components/ui/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/motion/Reveal";
import { AccountLogoutButton } from "@/components/auth/AccountLogoutButton";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, type Locale } from "@/lib/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { getSessionUser, getCurrentProfile } from "@/lib/auth/supabaseServer";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/account">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const dict = await getDictionary(locale);
  return buildMetadata({
    locale,
    path: "/account",
    title: dict.auth.account.heading,
    description: dict.auth.account.heading,
    index: false,
  });
}

/**
 * Fase 2 minimal private area — just enough to prove the session works.
 * Deliberately shows NOTHING about projects/pagos/conversaciones/
 * mantenimiento/client data yet (that's Fase 4, once account<->client
 * linking exists). Server-side protected: an unauthenticated request
 * never renders this page's content at all — getSessionUser() re-
 * validates against Supabase Auth on every request, it never trusts a
 * client-side-only check.
 */
export default async function AccountPage({ params }: PageProps<"/[locale]/account">) {
  const { locale: rawLocale } = await params;
  if (!hasLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const dict = await getDictionary(locale);

  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);

  const profile = await getCurrentProfile();
  // Personalized only when we actually have a name — never substitutes
  // the email as a stand-in name (see 0011_profiles_full_name.sql; the
  // profile row can only be missing in the narrow race documented on
  // getCurrentProfile() above).
  const heading = profile
    ? `${dict.auth.account.greetingPrefix} ${profile.fullName}`
    : dict.auth.account.heading;

  return (
    <>
      <PageIntro eyebrow={dict.auth.account.eyebrow} heading={heading} />
      <Section>
        <Container size="narrow">
          <Reveal>
            <div className="rounded-lg border border-border-strong bg-bg-raised p-8">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={dict.auth.account.emailLabel} value={user.email ?? "—"} />
                <Field
                  label={dict.auth.account.roleLabel}
                  value={
                    profile ? dict.auth.roleLabels[profile.role] : dict.auth.roleLabels.client
                  }
                />
                <Field
                  label={dict.auth.account.sessionActiveLabel}
                  value={dict.auth.account.sessionActiveLabel}
                />
              </div>
              <div className="mt-6">
                <AccountLogoutButton
                  label={dict.auth.account.logout}
                  loginHref={`/${locale}/login`}
                />
              </div>
            </div>
          </Reveal>
        </Container>
      </Section>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-fg-subtle">{label}</p>
      <p className="mt-1 text-sm text-fg">{value}</p>
    </div>
  );
}
