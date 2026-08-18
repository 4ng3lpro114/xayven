import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";

interface PageIntroProps {
  eyebrow: string;
  heading: string;
  description?: string;
  /** SEO/AEO/GEO Phase 8 — optional <Breadcrumb> rendered above the
   *  eyebrow. Omitted everywhere except the pages that adopted
   *  breadcrumbs (Services, Maintenance) — every other existing
   *  PageIntro usage is unaffected. */
  breadcrumb?: ReactNode;
}

export function PageIntro({ eyebrow, heading, description, breadcrumb }: PageIntroProps) {
  return (
    <section className="relative overflow-hidden pb-4 pt-16 sm:pt-20">
      <div className="field-glow" />
      <Container className="relative z-10">
        <Reveal>
          {breadcrumb && <div className="mb-5">{breadcrumb}</div>}
          <Badge variant="eyebrow">{eyebrow}</Badge>
          <h1 className="mt-5 max-w-2xl text-display-2 font-semibold tracking-tight text-fg">
            {heading}
          </h1>
          {description && (
            <p className="mt-5 max-w-xl text-lg text-fg-muted">{description}</p>
          )}
        </Reveal>
      </Container>
    </section>
  );
}
