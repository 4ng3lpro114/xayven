import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageIntro } from "@/components/ui/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/motion/Reveal";
import { LoginForm } from "@/components/auth/LoginForm";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, type Locale } from "@/lib/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { getSessionUser } from "@/lib/auth/supabaseServer";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/login">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const dict = await getDictionary(locale);
  return buildMetadata({
    locale,
    path: "/login",
    title: dict.auth.login.heading,
    description: dict.auth.login.description,
    index: false,
  });
}

export default async function LoginPage({ params }: PageProps<"/[locale]/login">) {
  const { locale: rawLocale } = await params;
  if (!hasLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const dict = await getDictionary(locale);

  // Already signed in — no reason to show the login form again.
  const user = await getSessionUser();
  if (user) redirect(`/${locale}/account`);

  return (
    <>
      <PageIntro
        eyebrow={dict.auth.login.eyebrow}
        heading={dict.auth.login.heading}
        description={dict.auth.login.description}
      />
      <Section>
        <Container size="narrow">
          <Reveal>
            <LoginForm
              form={dict.auth.login}
              registerHref={`/${locale}/register`}
              accountHref={`/${locale}/account`}
            />
          </Reveal>
        </Container>
      </Section>
    </>
  );
}
