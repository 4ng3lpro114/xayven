import { cn } from "@/lib/utils";
import type { Project } from "@/lib/data/projects";

/**
 * Generated cover art for a project card / case study header. We don't have
 * (and won't fabricate) product screenshots for every project, so each
 * cover is an abstract composition built from the brand system — kept
 * distinct per project via the `accent` variant, not a stock photo.
 *
 * XAYVEN CORE Phase 3.2B (UI visual polish): the previous version was a
 * single glow blob in one corner over a mostly-empty rectangle — real
 * production evidence (screenshot review of /es/work) showed it read as
 * "empty dark box with a smudge," not an intentional composition. This
 * version layers a second, dimmer glow, an inset vignette (depth toward
 * the center) and a bottom scrim (legibility for the title) on top of the
 * same grid-overlay/gradient primitives already used elsewhere in the
 * brand system — no new colors, no stock imagery, no new dependency.
 * `shadow-soft` (resting) → `shadow-glow-sm` (hover, via the parent
 * ProjectCard's `.group`) mirrors the exact hover signature also applied
 * to ServiceIndexCard/MaintenancePlanCard in this same phase, so the
 * three public card families now share one hover language. The
 * background layer gets a very slight zoom on hover (group-hover, CSS
 * only) — the title stays fixed since it sits outside the scaled layer,
 * so only the composition breathes, never the text.
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
        "relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-lg border border-border shadow-soft transition-[border-color,box-shadow] duration-300 group-hover:border-border-accent group-hover:shadow-glow-sm",
        className
      )}
    >
      <div className="absolute inset-0 scale-100 transition-transform duration-500 ease-out group-hover:scale-[1.04]">
        <CoverBackground accent={project.accent} />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-bg/90 via-bg/25 to-transparent" />
      <div className="relative z-10 p-5">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-subtle">
          {project.year}
        </span>
        <p className="mt-1 text-xl font-semibold leading-tight text-fg sm:text-2xl">{title}</p>
      </div>
    </div>
  );
}

/** Shared inset vignette — pulls focus toward the center so the composition
 *  reads as deliberate depth rather than a flat fill, on every variant. */
const VIGNETTE_STYLE = { boxShadow: "inset 0 0 70px 18px rgba(7,6,10,0.5)" };

function CoverBackground({ accent }: { accent: Project["accent"] }) {
  if (accent === "violet") {
    return (
      <div className="absolute inset-0 bg-bg-raised">
        <div
          className="absolute -right-12 -top-20 size-64 rounded-full opacity-70 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-accent-500), transparent 70%)" }}
        />
        <div
          className="absolute -bottom-16 -left-12 size-48 rounded-full opacity-35 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-accent-700), transparent 70%)" }}
        />
        <div className="absolute inset-0 grid-overlay opacity-60" />
        <div className="absolute inset-0" style={VIGNETTE_STYLE} />
      </div>
    );
  }

  if (accent === "duotone") {
    return (
      <div className="absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, var(--color-bg-raised) 0%, var(--color-bg-raised) 45%, var(--color-accent-700) 100%)",
          }}
        />
        <div className="absolute inset-0 grid-overlay opacity-30" />
        <div
          className="absolute -top-16 left-1/4 size-48 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-accent-400), transparent 70%)" }}
        />
        <div className="absolute inset-0" style={VIGNETTE_STYLE} />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-bg-raised">
      <div
        className="absolute -left-10 -top-16 size-56 rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--color-fg-subtle), transparent 70%)" }}
      />
      <div className="absolute inset-0 grid-overlay opacity-40" />
      <div
        className="absolute bottom-0 left-0 h-1 w-full"
        style={{ background: "linear-gradient(90deg, transparent, var(--color-accent-500), transparent)" }}
      />
      <div className="absolute inset-0" style={VIGNETTE_STYLE} />
    </div>
  );
}
