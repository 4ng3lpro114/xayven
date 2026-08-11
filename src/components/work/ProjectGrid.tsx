import { ProjectCard } from "@/components/work/ProjectCard";
import { getProjectCopy, type Project } from "@/lib/data/projects";
import type { Locale } from "@/lib/i18n/config";

interface ProjectGridProps {
  projects: Project[];
  locale: Locale;
  realBadgeLabel: string;
  conceptBadgeLabel: string;
  emptyLabel: string;
}

export function ProjectGrid({
  projects,
  locale,
  realBadgeLabel,
  conceptBadgeLabel,
  emptyLabel,
}: ProjectGridProps) {
  if (projects.length === 0) {
    return <p className="text-sm text-fg-muted">{emptyLabel}</p>;
  }

  return (
    <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project, i) => (
        <ProjectCard
          key={project.slug}
          project={project}
          copy={getProjectCopy(project, locale)}
          locale={locale}
          realBadgeLabel={realBadgeLabel}
          conceptBadgeLabel={conceptBadgeLabel}
          delay={0.06 * i}
        />
      ))}
    </div>
  );
}
