import { cn } from "@/lib/utils";
import type { Project } from "@/lib/data/projects";

/**
 * Generated cover art for a project card / case study header. We don't have
 * (and won't fabricate) product screenshots for every project, so each
 * cover is an abstract composition built from the brand system — kept
 * distinct per project via the `accent` variant, not a stock photo.
 */
export function ProjectCover({
  project,
  title,
  className,
}: {
  project: Project;
  title: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-lg border border-border",
        className
      )}
    >
      <CoverBackground accent={project.accent} />
      <div className="relative z-10 p-5">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-subtle">
          {project.year}
        </span>
        <p className="mt-1 text-xl font-semibold leading-tight text-fg sm:text-2xl">{title}</p>
      </div>
    </div>
  );
}

function CoverBackground({ accent }: { accent: Project["accent"] }) {
  if (accent === "violet") {
    return (
      <div className="absolute inset-0 bg-bg-raised">
        <div
          className="absolute -right-10 -top-16 size-56 rounded-full opacity-70 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-accent-500), transparent 70%)" }}
        />
        <div className="absolute inset-0 grid-overlay opacity-60" />
      </div>
    );
  }

  if (accent === "duotone") {
    return (
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, var(--color-bg-raised) 0%, var(--color-bg-raised) 45%, var(--color-accent-700) 100%)",
        }}
      />
    );
  }

  return (
    <div className="absolute inset-0 bg-bg-raised">
      <div className="absolute inset-0 grid-overlay opacity-40" />
      <div
        className="absolute bottom-0 left-0 h-1 w-full"
        style={{ background: "linear-gradient(90deg, transparent, var(--color-accent-500), transparent)" }}
      />
    </div>
  );
}
