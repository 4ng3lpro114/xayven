import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";

interface PageIntroProps {
  eyebrow: string;
  heading: string;
  description?: string;
}

export function PageIntro({ eyebrow, heading, description }: PageIntroProps) {
  return (
    <section className="relative overflow-hidden pb-4 pt-16 sm:pt-20">
      <div className="field-glow" />
      <Container className="relative z-10">
        <Reveal>
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
