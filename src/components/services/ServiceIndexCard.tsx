import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";

interface ServiceIndexCardProps {
  href: string;
  icon: LucideIcon;
  heading: string;
  tagline: string;
  /** Already formatted — "Desde 799.000 COP" / "From 799,000 COP" /
   *  "Cotización personalizada" / "Custom quote". Pricing Core is the
   *  source of the number; this component only renders the string it's
   *  given (see formatServicePriceLabel() in lib/services/pricingSummary.ts). */
  priceLabel: string;
  viewLabel: string;
  delay?: number;
}

/**
 * Same visual shell as ui/ServiceCard.tsx (border, padding, hover states,
 * accent-tinted icon tile) — kept visually identical on purpose (Services
 * Phase 2: "mantener el diseño visual actual"). Different body: this card
 * links to the service's detail page instead of showing the old
 * who/problem/outcome triplet inline, and surfaces a Pricing-Core-derived
 * price instead of none.
 *
 * XAYVEN CORE Phase 3.2B (UI visual polish): structure and content
 * untouched — only the resting/hover treatment was brought in line with
 * ProjectCover/MaintenancePlanCard's shared signature (`shadow-soft` at
 * rest → `shadow-glow-sm` + accent border on hover), plus the icon tile
 * now brightens to `bg-overlay` on hover (that token's own documented
 * purpose is exactly "hover surfaces"). Same family, same language, no
 * new card variant.
 */
export function ServiceIndexCard({ href, icon: Icon, heading, tagline, priceLabel, viewLabel, delay = 0 }: ServiceIndexCardProps) {
  return (
    <Reveal delay={delay} className="h-full">
      <Link
        href={href}
        className="group flex h-full flex-col rounded-lg border border-border bg-bg-raised p-6 shadow-soft transition-[border-color,box-shadow] duration-300 hover:border-border-accent hover:shadow-glow-sm"
      >
        <div className="flex size-11 items-center justify-center rounded-md border border-border-strong bg-bg-elevated text-accent-400 transition-colors duration-300 group-hover:border-border-accent group-hover:bg-bg-overlay">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <h3 className="mt-5 text-lg font-semibold text-fg">{heading}</h3>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">{tagline}</p>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-5 text-sm">
          <span className="font-mono text-[0.68rem] uppercase tracking-[0.1em] text-fg-subtle">{priceLabel}</span>
          <span className="inline-flex shrink-0 items-center gap-1 font-medium text-accent-300 transition-transform duration-300 group-hover:translate-x-0.5">
            {viewLabel}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </span>
        </div>
      </Link>
    </Reveal>
  );
}
