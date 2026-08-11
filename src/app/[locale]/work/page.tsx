import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/ui/PageIntro";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { ProjectGrid } from "@/components/work/ProjectGrid";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { projects } from "@/lib/data/projects";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, type Locale } from "@/lib/i18n/config";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/work">): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const dict = await getDictionary(locale);
  return buildMetadata({
    locale,
    path: "/work",
    title: dict.pages.work.title,
    description: dict.pages.work.description,
  });
}

export default async function WorkPage({ params }: PageProps<"/[locale]/work">) {
  const { locale: rawLocale } = await params;
  if (!hasLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const dict = await getDictionary(locale);

  return (
    <>
      <PageIntro
        eyebrow={dict.work.eyebrow}
        heading={dict.work.heading}
        description={dict.work.description}
      />
      <Section>
        <Container>
          <ProjectGrid
            projects={projects}
            locale={locale}
            realBadgeLabel={dict.work.realBadge}
            conceptBadgeLabel={dict.work.conceptBadge}
            emptyLabel={dict.work.empty}
          />
        </Container>
      </Section>
      <FinalCTA dict={dict} locale={locale} />
    </>
  );
}
