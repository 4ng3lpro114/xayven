import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  eyebrow: string;
  heading: string;
  description?: string;
  align?: "left" | "center";
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({
  eyebrow,
  heading,
  description,
  align = "left",
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <Reveal className={cn(align === "center" && "mx-auto max-w-2xl text-center")}>
        <Badge variant="eyebrow">{eyebrow}</Badge>
        <h2 className="mt-4 text-display-2 font-semibold tracking-tight text-fg">{heading}</h2>
        {description && <p className="mt-4 max-w-xl text-base text-fg-muted">{description}</p>}
      </Reveal>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
