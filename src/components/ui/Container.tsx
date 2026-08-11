import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ContainerProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  /** Narrower measure for text-heavy content (case studies, FAQ, legal). */
  size?: "default" | "narrow";
}

export function Container({
  children,
  className,
  as: Tag = "div",
  size = "default",
}: ContainerProps) {
  return (
    <Tag
      className={cn(
        "mx-auto w-full px-5 sm:px-8 lg:px-12",
        size === "default" ? "max-w-[88rem]" : "max-w-[52rem]",
        className
      )}
    >
      {children}
    </Tag>
  );
}
