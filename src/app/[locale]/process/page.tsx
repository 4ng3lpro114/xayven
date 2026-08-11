import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/ui/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { ProcessStep } from "@/components/process/ProcessStep";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, type Locale } from "@/lib/i18n/config";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/process">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const dict = await getDictionary(locale);
  return buildMetadata({
    locale,
    path: "/process",
    title: dict.pages.process.title,
    description: dict.pages.process.description,
  });
}

export default async function ProcessPage({
  params,
}: PageProps<"/[locale]/process">) {
  const { locale: rawLocale } = await params;
  if (!hasLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const dict = await getDictionary(locale);

  return (
    <>
      <PageIntro
        eyebrow={dict.process.eyebrow}
        heading={dict.process.heading}
        description={dict.process.description}
      />
      <Section>
        <Container size="narrow">
          {dict.process.steps.map((step, i) => (
            <ProcessStep
              key={step.number}
              number={step.number}
              title={step.title}
              description={step.description}
              delay={0.04 * i}
              isLast={i === dict.process.steps.length - 1}
            />
          ))}
        </Container>
      </Section>
      <FinalCTA dict={dict} locale={locale} />
    </>
  );
}
