import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageIntro } from "@/components/ui/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/motion/Reveal";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, type Locale } from "@/lib/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { getSessionUser } from "@/lib/auth/supabaseServer";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/register">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const dict = await getDictionary(locale);
  return buildMetadata({
    locale,
    path: "/register",
    title: dict.auth.register.heading,
    description: dict.auth.register.description,
    index: false,
  });
}

export default async function RegisterPage({ params }: PageProps<"/[locale]/register">) {
  const { locale: rawLocale } = await params;
  if (!hasLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const dict = await getDictionary(locale);

  const user = await getSessionUser();
  if (user) redirect(`/${locale}/account`);

  return (
    <>
      <PageIntro
        eyebrow={dict.auth.register.eyebrow}
        heading={dict.auth.register.heading}
        description={dict.auth.register.description}
      />
      <Section>
        <Container size="narrow">
          <Reveal>
            <RegisterForm
              form={dict.auth.register}
              loginHref={`/${locale}/login`}
              accountHref={`/${locale}/account`}
            />
          </Reveal>
        </Container>
      </Section>
    </>
  );
}
