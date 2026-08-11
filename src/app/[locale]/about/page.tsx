import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { X } from "lucide-react";
import { PageIntro } from "@/components/ui/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/motion/Reveal";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, type Locale } from "@/lib/i18n/config";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/about">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const dict = await getDictionary(locale);
  return buildMetadata({
    locale,
    path: "/about",
    title: dict.pages.about.title,
    description: dict.pages.about.description,
  });
}

export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const { locale: rawLocale } = await params;
  if (!hasLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const dict = await getDictionary(locale);

  return (
    <>
      <PageIntro eyebrow={dict.about.eyebrow} heading={dict.about.heading} />
      <Section spacing="tight">
        <Container size="narrow">
          <Reveal>
            <p className="text-lg text-fg-muted">{dict.about.intro}</p>
          </Reveal>
        </Container>
      </Section>

      <Section divider>
        <Container size="narrow">
          <Reveal>
            <h2 className="text-display-2 font-semibold tracking-tight text-fg">
              {dict.about.approachHeading}
            </h2>
            <p className="mt-5 text-base text-fg-muted">{dict.about.approach}</p>
          </Reveal>
        </Container>
      </Section>

      <Section divider spacing="tight">
        <Container size="narrow">
          <Reveal>
            <h2 className="text-h3 font-semibold text-fg">{dict.about.valuesHeading}</h2>
            <ul className="mt-5 space-y-3">
              {dict.about.values.map((value) => (
                <li key={value} className="flex items-start gap-3 text-sm text-fg-muted">
                  <X className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                  {value}
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </Section>

      <FinalCTA dict={dict} locale={locale} />
    </>
  );
}
