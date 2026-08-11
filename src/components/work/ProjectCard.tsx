import Link from "next/link";
import { ProjectCover } from "@/components/work/ProjectCover";
import { Reveal } from "@/components/motion/Reveal";
import type { Project, ProjectCopy } from "@/lib/data/projects";
import type { Locale } from "@/lib/i18n/config";

interface ProjectCardProps {
  project: Project;
  copy: ProjectCopy;
  locale: Locale;
  realBadgeLabel: string;
  conceptBadgeLabel: string;
  delay?: number;
}

export function ProjectCard({
  project,
  copy,
  locale,
  realBadgeLabel,
  conceptBadgeLabel,
  delay = 0,
}: ProjectCardProps) {
  return (
    <Reveal delay={delay}>
      <Link href={`/${locale}/work/${project.slug}`} className="group block">
        <div className="relative">
          <ProjectCover project={project} title={copy.title} />
          <span
            className="absolute right-4 top-4 z-10 rounded-full border px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.08em] backdrop-blur-sm"
            style={{
              borderColor:
                project.type === "real" ? "var(--color-border-accent)" : "var(--color-border-strong)",
              background: "rgba(7,6,10,0.55)",
              color: project.type === "real" ? "var(--color-accent-300)" : "var(--color-fg-muted)",
            }}
          >
            {project.type === "real" ? realBadgeLabel : conceptBadgeLabel}
          </span>
        </div>
        <div className="mt-4">
          <p className="text-sm text-fg-muted">{copy.category}</p>
          <p className="mt-1.5 text-sm text-fg-subtle transition-colors group-hover:text-fg-muted">
            {copy.summary}
          </p>
        </div>
      </Link>
    </Reveal>
  );
}
