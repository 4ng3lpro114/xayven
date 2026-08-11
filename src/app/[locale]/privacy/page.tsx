import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/ui/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/motion/Reveal";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, type Locale } from "@/lib/i18n/config";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const dict = await getDictionary(locale);
  return buildMetadata({
    locale,
    path: "/privacy",
    title: dict.pages.privacy.title,
    description: dict.pages.privacy.description,
  });
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale: rawLocale } = await params;
  if (!hasLocale(rawLocale)) notFound();
  const dict = await getDictionary(hasLocale(rawLocale) ? rawLocale : "es");

  return (
    <>
      <PageIntro
        eyebrow={dict.privacy.eyebrow}
        heading={dict.privacy.heading}
        description={dict.privacy.intro}
      />
      <Section spacing="tight">
        <Container size="narrow">
          <div className="space-y-10">
            {dict.privacy.sections.map((section, i) => (
              <Reveal key={section.heading} delay={0.03 * i}>
                <h2 className="text-h3 font-semibold text-fg">{section.heading}</h2>
                <p className="mt-2.5 text-base text-fg-muted">{section.body}</p>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.2}>
            <p className="mt-12 border-t border-border pt-8 text-sm text-fg-subtle">
              {dict.privacy.contactNote}
            </p>
          </Reveal>
        </Container>
      </Section>
    </>
  );
}
