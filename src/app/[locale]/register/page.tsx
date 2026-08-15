import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { AuthVisualPanel } from "@/components/auth/AuthVisualPanel";
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
    <section className="relative flex min-h-[calc(100vh-4rem)] items-center overflow-hidden py-14 sm:py-20">
      <div className="field-glow" />
      <div className="grid-overlay" />
      <Container className="relative z-10">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div className="mx-auto w-full max-w-md lg:mx-0">
            <Reveal>
              <Badge variant="eyebrow">{dict.auth.register.eyebrow}</Badge>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-4 text-display-2 font-semibold text-fg">
                {dict.auth.register.heading}
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-3 text-base text-fg-muted">{dict.auth.register.description}</p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="mt-8 rounded-2xl border border-border-strong bg-bg-raised/60 p-6 shadow-soft sm:p-8">
                <RegisterForm
                  form={dict.auth.register}
                  loginHref={`/${locale}/login`}
                  accountHref={`/${locale}/account`}
                  locale={locale}
                />
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.1} offset={24}>
            <AuthVisualPanel
              variant="register"
              tagline={dict.auth.register.panelTagline}
              labels={dict.auth.panel}
            />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
