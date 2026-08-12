import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";
import { ProjectGrid } from "@/components/work/ProjectGrid";
import { projects } from "@/lib/data/projects";
import type { Dictionary } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/config";

export function SelectedWork({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  return (
    <Section divider>
      <Container>
        <SectionHeader
          eyebrow={dict.work.eyebrow}
          heading={dict.work.heading}
          description={dict.work.description}
          action={
            <Button href={`/${locale}/work`} variant="secondary" withArrow>
              {dict.work.ctaLabel}
            </Button>
          }
        />

        <div className="mt-12">
          <ProjectGrid
            projects={projects.filter((p) => p.published !== false)}
            locale={locale}
            realBadgeLabel={dict.work.realBadge}
            conceptBadgeLabel={dict.work.conceptBadge}
            emptyLabel={dict.work.empty}
          />
        </div>
      </Container>
    </Section>
  );
}
