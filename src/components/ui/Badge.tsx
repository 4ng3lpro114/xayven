import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BadgeProps {
  children: ReactNode;
  className?: string;
  variant?: "eyebrow" | "outline" | "solid";
}

/**
 * Small label used for eyebrows ("SERVICES"), status tags ("Real project"),
 * and process step numbers.
 */
export function Badge({ children, className, variant = "outline" }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full text-xs font-medium tracking-wide",
        variant === "eyebrow" &&
          "font-mono uppercase text-accent-300 tracking-[0.14em] text-[0.7rem]",
        variant === "outline" &&
          "border border-border-strong bg-bg-elevated/60 px-3 py-1 text-fg-muted",
        variant === "solid" &&
          "bg-accent-500 px-3 py-1 text-white",
        className
      )}
    >
      {children}
    </span>
  );
}
