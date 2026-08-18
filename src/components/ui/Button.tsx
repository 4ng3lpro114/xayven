import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

interface SharedProps {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
  /** Shows a small arrow — used for primary/navigational actions. */
  withArrow?: boolean;
}

interface ButtonAsLink extends SharedProps {
  href: string;
  target?: string;
  rel?: string;
  /** Optional — fires before navigation. Only meaningful when this
   *  Button is used from within an already-"use client" wrapper (e.g.
   *  TrackedCtaLink.tsx); Server Components must never pass this
   *  directly. Analytics Phase 7's one addition to this shared
   *  component. */
  onClick?: () => void;
}

interface ButtonAsButton
  extends SharedProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> {
  href?: undefined;
}

type ButtonProps = ButtonAsLink | ButtonAsButton;

const base =
  "group inline-flex items-center justify-center gap-2 rounded-pill font-medium transition-all duration-[var(--duration-fast)] ease-[var(--ease-brand)] focus-visible:outline-2 focus-visible:outline-accent-400 disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent-500 text-white shadow-glow-sm hover:bg-accent-400 hover:shadow-glow-md active:bg-accent-600",
  secondary:
    "border border-border-strong text-fg bg-bg-elevated/50 hover:border-border-accent hover:bg-bg-overlay",
  ghost: "text-fg-muted hover:text-fg",
};

const sizes: Record<Size, string> = {
  md: "px-5 py-2.5 text-sm",
  lg: "px-7 py-3.5 text-base",
};

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "md",
    children,
    className,
    withArrow = false,
  } = props;

  const classes = cn(base, variants[variant], sizes[size], className);
  const content = (
    <>
      {children}
      {withArrow && (
        <ArrowUpRight
          className="size-4 shrink-0 transition-transform duration-[var(--duration-fast)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          aria-hidden="true"
        />
      )}
    </>
  );

  if ("href" in props && props.href) {
    return (
      <Link href={props.href} target={props.target} rel={props.rel} onClick={props.onClick} className={classes}>
        {content}
      </Link>
    );
  }

  // Strip the component's own props (variant/size/withArrow/etc.) before
  // spreading — only genuine native <button> attributes (onClick, disabled,
  // type, ...) should ever reach the DOM element. The stripped bindings are
  // intentionally unused; that's the whole point of this destructure.
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const {
    variant: _variant,
    size: _size,
    children: _children,
    className: _className,
    withArrow: _withArrow,
    href: _href,
    ...nativeButtonProps
  } = props as ButtonAsButton;
  /* eslint-enable @typescript-eslint/no-unused-vars */
  return (
    <button {...nativeButtonProps} className={classes}>
      {content}
    </button>
  );
}
