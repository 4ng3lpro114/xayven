import { Reveal } from "@/components/motion/Reveal";

interface ProcessStepProps {
  number: string;
  title: string;
  description: string;
  delay?: number;
  /** Hides the connecting line after the last step in a list. */
  isLast?: boolean;
}

export function ProcessStep({ number, title, description, delay = 0, isLast = false }: ProcessStepProps) {
  return (
    <Reveal delay={delay}>
      <div className="relative flex gap-5 pb-10">
        {!isLast && (
          <span
            className="absolute left-[1.375rem] top-11 hidden h-[calc(100%-1.75rem)] w-px bg-border sm:block"
            aria-hidden="true"
          />
        )}
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border-strong bg-bg-elevated font-mono text-sm text-accent-300">
          {number}
        </span>
        <div className="pt-1.5">
          <h3 className="text-lg font-semibold text-fg">{title}</h3>
          <p className="mt-1.5 max-w-md text-sm text-fg-muted">{description}</p>
        </div>
      </div>
    </Reveal>
  );
}
