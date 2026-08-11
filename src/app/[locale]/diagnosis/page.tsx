import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/ui/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { DiagnosisTool } from "@/components/diagnosis/DiagnosisTool";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, type Locale } from "@/lib/i18n/config";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/diagnosis">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const dict = await getDictionary(locale);
  return buildMetadata({
    locale,
    path: "/diagnosis",
    title: dict.pages.diagnosis.title,
    description: dict.pages.diagnosis.description,
  });
}

export default async function DiagnosisPage({
  params,
}: PageProps<"/[locale]/diagnosis">) {
  const { locale: rawLocale } = await params;
  if (!hasLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const dict = await getDictionary(locale);

  return (
    <>
      <PageIntro eyebrow={dict.diagnosis.eyebrow} heading={dict.diagnosis.heading} />
      <Section spacing="tight">
        <Container size="narrow">
          <DiagnosisTool
            dict={dict.diagnosis}
            locale={locale}
            contactHref={`/${locale}/contact`}
          />
        </Container>
      </Section>
    </>
  );
}
