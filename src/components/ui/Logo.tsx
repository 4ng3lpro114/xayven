import { useId } from "react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** Renders the symbol mark only (used in tight spaces / loading states). */
  markOnly?: boolean;
  /** Pixel size of the SVG mark itself. Defaults to 22 — the size used by
   *  every existing call site today (ChatWidget, etc.) — so nothing that
   *  omits this prop changes appearance. */
  size?: number;
}

/**
 * XAYVEN wordmark. A clean typographic mark today, paired with a simple
 * geometric "X" symbol that can stand on its own once the brand grows a
 * dedicated icon system (see also app/icon.tsx for the favicon version).
 */
export function Logo({ className, markOnly = false, size = 22 }: LogoProps) {
  // Unique per instance — without this, two <Logo> instances rendered on
  // the same page (e.g. the ChatWidget toggle button + this component used
  // elsewhere) would both define a gradient with the same hardcoded id,
  // which is invalid SVG/HTML and can make the fill fail to resolve for
  // one of them, leaving the rect (and therefore the whole mark) unpainted.
  const gradientId = `xayven-mark-gradient-${useId()}`;

  return (
    <span className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="24" height="24" rx="6" fill={`url(#${gradientId})`} />
        <path
          d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5"
          stroke="#07060A"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#C9A8FF" />
            <stop offset="1" stopColor="#7C34F2" />
          </linearGradient>
        </defs>
      </svg>
      {!markOnly && (
        <span className="text-[1.05rem] font-semibold tracking-[-0.01em] text-fg">
          XAYVEN
        </span>
      )}
    </span>
  );
}
