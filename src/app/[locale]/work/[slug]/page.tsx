import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/motion/Reveal";
import { ProjectCover } from "@/components/work/ProjectCover";
import { FinalCTA } from "@/components/sections/FinalCTA";
import {
  projects,
  getProjectBySlug,
  getProjectCopy,
} from "@/lib/data/projects";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale, locales, type Locale } from "@/lib/i18n/config";
import { buildMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return locales.flatMap((locale) => projects.map((p) => ({ locale, slug: p.slug })));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/work/[slug]">): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const project = getProjectBySlug(slug);
  const dict = await getDictionary(locale);
  if (!project) {
    return buildMetadata({
      locale,
      path: "/work",
      title: dict.pages.work.title,
      description: dict.pages.work.description,
    });
  }
  const copy = getProjectCopy(project, locale);
  return buildMetadata({
    locale,
    path: `/work/${project.slug}`,
    title: copy.title,
    description: copy.summary,
  });
}

export default async function ProjectPage({
  params,
}: PageProps<"/[locale]/work/[slug]">) {
  const { locale: rawLocale, slug } = await params;
  if (!hasLocale(rawLocale)) notFound();
  const locale = rawLocale;

  const project = getProjectBySlug(slug);
  if (!project) notFound();

  const dict = await getDictionary(locale);
  const copy = getProjectCopy(project, locale);

  const currentIndex = projects.findIndex((p) => p.slug === project.slug);
  const next = projects[(currentIndex + 1) % projects.length];
  const nextCopy = getProjectCopy(next, locale);

  const fields: { label: string; value: string }[] = [
    { label: dict.work.fields.problem, value: copy.problem },
    { label: dict.work.fields.goal, value: copy.goal },
    { label: dict.work.fields.solution, value: copy.solution },
    { label: dict.work.fields.design, value: copy.design },
    { label: dict.work.fields.tech, value: copy.tech },
    { label: dict.work.fields.result, value: copy.result },
  ];

  return (
    <>
      <Section spacing="tight" className="pt-14 sm:pt-20">
        <Container size="narrow">
          <Reveal>
            <Link
              href={`/${locale}/work`}
              className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {dict.work.backToWork}
            </Link>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Badge variant={project.type === "real" ? "solid" : "outline"}>
                {project.type === "real" ? dict.work.realBadge : dict.work.conceptBadge}
              </Badge>
              <span className="text-sm text-fg-subtle">{project.year}</span>
            </div>

            <h1 className="mt-4 text-display-2 font-semibold tracking-tight text-fg">
              {copy.title}
            </h1>
            <p className="mt-3 text-base text-fg-muted">{copy.category}</p>
            <p className="mt-5 max-w-xl text-lg text-fg-muted">{copy.summary}</p>

            <ul className="mt-6 flex flex-wrap gap-2">
              {project.stack.map((tech) => (
                <li
                  key={tech}
                  className="rounded-pill border border-border bg-bg-raised px-3 py-1 text-xs text-fg-muted"
                >
                  {tech}
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </Section>

      <Section spacing="tight">
        <Container>
          <Reveal>
            <ProjectCover project={project} title={copy.title} className="aspect-[16/9]" />
          </Reveal>
        </Container>
      </Section>

      <Section>
        <Container size="narrow">
          <dl className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {fields.map((field, i) => (
              <Reveal key={field.label} delay={0.03 * i}>
                <dt className="font-mono text-xs uppercase tracking-[0.12em] text-fg-subtle">
                  {field.label}
                </dt>
                <dd className="mt-2 text-base text-fg-muted">{field.value}</dd>
              </Reveal>
            ))}
          </dl>
        </Container>
      </Section>

      <Section spacing="tight" divider>
        <Container size="narrow">
          <p className="text-sm text-fg-subtle">
            {project.type === "real"
              ? locale === "es"
                ? "Capturas de pantalla reales del sitio publicado se añadirán próximamente."
                : "Real screenshots of the published site will be added soon."
              : locale === "es"
                ? "Exploración visual conceptual — este proyecto todavía no ha sido desarrollado."
                : "Conceptual visual exploration — this project hasn't been developed yet."}
          </p>
        </Container>
      </Section>

      <Section divider spacing="tight">
        <Container>
          <Reveal>
            <Link
              href={`/${locale}/work/${next.slug}`}
              className="group flex items-center justify-between gap-6 py-4"
            >
              <div>
                <span className="font-mono text-xs uppercase tracking-[0.12em] text-fg-subtle">
                  {dict.work.nextProject}
                </span>
                <p className="mt-1 text-xl font-semibold text-fg transition-colors group-hover:text-accent-300">
                  {nextCopy.title}
                </p>
              </div>
              <ArrowLeft className="size-5 rotate-180 text-fg-muted transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </Reveal>
        </Container>
      </Section>

      <FinalCTA dict={dict} locale={locale} />
    </>
  );
}
