import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** Renders the symbol mark only (used in tight spaces / loading states). */
  markOnly?: boolean;
}

/**
 * XAYVEN wordmark. A clean typographic mark today, paired with a simple
 * geometric "X" symbol that can stand on its own once the brand grows a
 * dedicated icon system (see also app/icon.tsx for the favicon version).
 */
export function Logo({ className, markOnly = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="24" height="24" rx="6" fill="url(#xayven-mark-gradient)" />
        <path
          d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5"
          stroke="#07060A"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="xayven-mark-gradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
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
