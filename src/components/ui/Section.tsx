import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionProps {
  children: ReactNode;
  className?: string;
  id?: string;
  /** Adds a subtle top border to separate from the previous section. */
  divider?: boolean;
  /** Tighter vertical rhythm for secondary sections. */
  spacing?: "default" | "tight";
}

export function Section({
  children,
  className,
  id,
  divider = false,
  spacing = "default",
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "relative",
        spacing === "default" ? "py-20 sm:py-28" : "py-14 sm:py-20",
        divider && "border-t border-border",
        className
      )}
    >
      {children}
    </section>
  );
}
