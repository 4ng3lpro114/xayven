"use client";

import { useEffect } from "react";
import { Check, ArrowUpRight } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics/track";

interface MaintenancePlanCardProps {
  /** Pricing Core slug (essential/growth/care-plus) — used only for
   *  analytics attribution (Analytics Phase 7), never rendered. */
  slug: string;
  name: string;
  tagline: string;
  who: string;
  features: string[];
  priceLabel: string;
  ctaLabel: string;
  featured?: boolean;
  delay?: number;
}

/**
 * Analytics Phase 7: this card is now a client component (previously a
 * plain server-rendered one) purely to fire `maintenance_plan_view` on
 * mount and `maintenance_cta` on the request-form link click — same
 * `trackEvent()` primitive every other tracked component in this arc
 * uses, no new mechanism.
 *
 * XAYVEN CORE Phase 3.2B (UI visual polish): visual-only pass to bring
 * this into the same card family as ProjectCover/ServiceIndexCard —
 * `shadow-soft` resting state and the shared `hover:shadow-glow-sm`
 * signature (featured plans, already resting at `shadow-glow-sm`, step up
 * to `shadow-glow-md` on hover instead) plus an arrow on the CTA matching
 * ServiceIndexCard's. No feature list, pricing, slug or tracking logic
 * touched.
 */
export function MaintenancePlanCard({
  slug,
  name,
  tagline,
  who,
  features,
  priceLabel,
  ctaLabel,
  featured = false,
  delay = 0,
}: MaintenancePlanCardProps) {
  useEffect(() => {
    trackEvent("maintenance_plan_view", { packageSlug: slug });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Reveal delay={delay} className="h-full">
      <article
        className={cn(
          "group flex h-full flex-col rounded-lg border p-6 transition-[border-color,box-shadow] duration-300",
          featured
            ? "border-border-accent bg-bg-elevated shadow-glow-sm hover:shadow-glow-md"
            : "border-border bg-bg-raised shadow-soft hover:border-border-accent hover:shadow-glow-sm"
        )}
      >
        <h3 className="text-lg font-semibold text-fg">{name}</h3>
        <p className="mt-1 text-sm text-accent-300">{tagline}</p>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">{who}</p>

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
            onClick={() => trackEvent("maintenance_cta", { packageSlug: slug })}
            className="inline-flex items-center gap-1 text-sm font-medium text-accent-300 transition-transform duration-300 group-hover:translate-x-0.5 hover:text-accent-200"
          >
            {ctaLabel}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
        </div>
      </article>
    </Reveal>
  );
}
