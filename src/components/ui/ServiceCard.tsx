import type { LucideIcon } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";

interface ServiceCardProps {
  icon: LucideIcon;
  title: string;
  summary: string;
  who: string;
  problem: string;
  outcome: string;
  fieldLabels: { who: string; problem: string; outcome: string };
  delay?: number;
}

export function ServiceCard({
  icon: Icon,
  title,
  summary,
  who,
  problem,
  outcome,
  fieldLabels,
  delay = 0,
}: ServiceCardProps) {
  return (
    <Reveal delay={delay} className="h-full">
      <article className="group flex h-full flex-col rounded-lg border border-border bg-bg-raised p-6 transition-colors duration-300 hover:border-border-accent">
        <div className="flex size-11 items-center justify-center rounded-md border border-border-strong bg-bg-elevated text-accent-400 transition-colors group-hover:border-border-accent">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <h3 className="mt-5 text-lg font-semibold text-fg">{title}</h3>
        <p className="mt-2 text-sm text-fg-muted">{summary}</p>

        <dl className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
          <div>
            <dt className="font-mono text-[0.68rem] uppercase tracking-[0.1em] text-fg-subtle">
              {fieldLabels.who}
            </dt>
            <dd className="mt-1 text-fg-muted">{who}</dd>
          </div>
          <div>
            <dt className="font-mono text-[0.68rem] uppercase tracking-[0.1em] text-fg-subtle">
              {fieldLabels.problem}
            </dt>
            <dd className="mt-1 text-fg-muted">{problem}</dd>
          </div>
          <div>
            <dt className="font-mono text-[0.68rem] uppercase tracking-[0.1em] text-fg-subtle">
              {fieldLabels.outcome}
            </dt>
            <dd className="mt-1 text-fg">{outcome}</dd>
          </div>
        </dl>
      </article>
    </Reveal>
  );
}
