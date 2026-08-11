import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Globe, ShoppingBag, Rocket, Fingerprint, Wrench } from "lucide-react";
import { PageIntro } from "@/components/ui/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { ServiceCard } from "@/components/ui/ServiceCard";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, type Locale } from "@/lib/i18n/config";
import { buildMetadata } from "@/lib/seo";

const ICONS = [Globe, ShoppingBag, Rocket, Fingerprint, Wrench];

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/services">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const dict = await getDictionary(locale);
  return buildMetadata({
    locale,
    path: "/services",
    title: dict.pages.services.title,
    description: dict.pages.services.description,
  });
}

export default async function ServicesPage({
  params,
}: PageProps<"/[locale]/services">) {
  const { locale: rawLocale } = await params;
  if (!hasLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const dict = await getDictionary(locale);

  return (
    <>
      <PageIntro
        eyebrow={dict.services.eyebrow}
        heading={dict.services.heading}
        description={dict.services.description}
      />
      <Section>
        <Container>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {dict.services.items.map((service, i) => (
              <ServiceCard
                key={service.title}
                icon={ICONS[i % ICONS.length]}
                title={service.title}
                summary={service.summary}
                who={service.who}
                problem={service.problem}
                outcome={service.outcome}
                fieldLabels={dict.services.fieldLabels}
                delay={0.05 * i}
              />
            ))}
          </div>
        </Container>
      </Section>
      <FinalCTA dict={dict} locale={locale} />
    </>
  );
}
