import { Check } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/utils";

interface MaintenancePlanCardProps {
  name: string;
  tagline: string;
  who: string;
  features: string[];
  priceLabel: string;
  ctaLabel: string;
  featured?: boolean;
  delay?: number;
}

export function MaintenancePlanCard({
  name,
  tagline,
  who,
  features,
  priceLabel,
  ctaLabel,
  featured = false,
  delay = 0,
}: MaintenancePlanCardProps) {
  return (
    <Reveal delay={delay} className="h-full">
      <article
        className={cn(
          "flex h-full flex-col rounded-lg border p-6",
          featured ? "border-border-accent bg-bg-elevated shadow-glow-sm" : "border-border bg-bg-raised"
        )}
      >
        <h3 className="text-lg font-semibold text-fg">{name}</h3>
        <p className="mt-1 text-sm text-accent-300">{tagline}</p>
        <p className="mt-3 text-sm text-fg-muted">{who}</p>

        <ul className="mt-5 flex-1 space-y-2.5">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm text-fg-muted">
              <Check className="mt-0.5 size-4 shrink-0 text-accent-400" aria-hidden="true" />
              {feature}
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
          <span className="text-sm font-medium text-fg">{priceLabel}</span>
          <a
            href="#maintenance-request"
            className="text-sm font-medium text-accent-300 transition-colors hover:text-accent-200"
          >
            {ctaLabel}
          </a>
        </div>
      </article>
    </Reveal>
  );
}
