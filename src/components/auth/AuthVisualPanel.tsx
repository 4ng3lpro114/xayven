import { Fragment } from "react";
import { FolderKanban, MessageSquare, Wallet } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionary";

interface AuthVisualPanelProps {
  variant: "login" | "register";
  tagline: string;
  labels: Dictionary["auth"]["panel"];
}

/**
 * Right-column visual companion for /login and /register — purely
 * decorative, no new functionality implied. Reuses the exact same visual
 * grammar already established site-wide (see Hero.tsx's HeroVisual and
 * globals.css's .field-glow/.grid-overlay): dot texture at the same
 * opacity/token, the same --color-accent-glow-soft radial glow, the same
 * corner-bracket detail, the same icon-node chain connected by a
 * gradient line with a pulsing accent dot. No new visual technique or
 * color token is introduced.
 *
 * `variant` only changes orientation (vertical for login, horizontal for
 * register) and which node pulses as the "core" — enough for the two
 * pages to read as siblings without being identical, per the design
 * brief. Node labels are decoration suggesting what an account will
 * eventually unlock (projects/conversations/payments) — none of that
 * exists yet on this page; see Fase 4.
 */
export function AuthVisualPanel({ variant, tagline, labels }: AuthVisualPanelProps) {
  const nodes = [
    { label: labels.projects, Icon: FolderKanban },
    { label: labels.conversations, Icon: MessageSquare },
    { label: labels.payments, Icon: Wallet },
  ];
  const coreIndex = variant === "login" ? 0 : 2;
  const vertical = variant === "login";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border-accent bg-bg-elevated p-6 shadow-glow-md sm:p-8 lg:p-10">
      {/* Ultra-faint dot texture — same source/opacity as HeroVisual's. */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: "radial-gradient(var(--color-border-strong) 1px, transparent 1.5px)",
          backgroundSize: "24px 24px",
        }}
        aria-hidden="true"
      />

      {/* Soft core glow — same token .field-glow/HeroVisual already use. */}
      <div
        className="absolute right-0 top-0 size-56 -translate-y-1/4 translate-x-1/4 rounded-full"
        style={{
          background: "radial-gradient(closest-side, var(--color-accent-glow-soft), transparent 72%)",
        }}
        aria-hidden="true"
      />

      {/* Corner brackets — same detail as HeroVisual's framing marks. */}
      <span className="absolute left-6 top-6 h-6 w-px bg-border-accent" aria-hidden="true" />
      <span className="absolute left-6 top-6 h-px w-6 bg-border-accent" aria-hidden="true" />
      <span className="absolute bottom-6 right-6 h-6 w-px bg-border-accent" aria-hidden="true" />
      <span className="absolute bottom-6 right-6 h-px w-6 bg-border-accent" aria-hidden="true" />

      <div className="relative z-10 flex h-full min-h-[15rem] flex-col justify-between gap-6 sm:min-h-[19rem] sm:gap-8 lg:min-h-[26rem] lg:gap-10">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-accent-300">
          XAYVEN
        </span>

        <p className="text-balance text-xl font-semibold leading-snug text-fg sm:text-2xl lg:text-3xl">
          {tagline}
        </p>

        {vertical ? (
          <div className="flex flex-col items-start">
            {nodes.map((node, i) => (
              <Fragment key={node.label}>
                <div className="flex items-center gap-3">
                  <NodeIcon Icon={node.Icon} pulsing={i === coreIndex} />
                  <span className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-muted">
                    {node.label}
                  </span>
                </div>
                {i < nodes.length - 1 && (
                  <div
                    className="relative ml-[1.375rem] my-2.5 flex h-6 w-px items-center justify-center bg-gradient-to-b from-accent-500/60 via-accent-400/20 to-accent-500/60"
                    aria-hidden="true"
                  >
                    <span className="size-1 rounded-full bg-accent-300 shadow-glow-sm" />
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="flex items-start">
            {nodes.map((node, i) => (
              <Fragment key={node.label}>
                <div className="flex flex-col items-center gap-2.5">
                  <NodeIcon Icon={node.Icon} pulsing={i === coreIndex} />
                  <span className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-muted">
                    {node.label}
                  </span>
                </div>
                {i < nodes.length - 1 && (
                  <div
                    className="relative mt-[1.375rem] flex h-px flex-1 items-center justify-center bg-gradient-to-r from-accent-500/60 via-accent-400/20 to-accent-500/60"
                    aria-hidden="true"
                  >
                    <span className="size-1 rounded-full bg-accent-300 shadow-glow-sm" />
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NodeIcon({
  Icon,
  pulsing,
}: {
  Icon: typeof FolderKanban;
  pulsing: boolean;
}) {
  return (
    <div className="relative flex size-11 shrink-0 items-center justify-center rounded-full border border-border-accent bg-bg-overlay shadow-glow-sm">
      {pulsing && (
        <span
          className="absolute -inset-2 animate-pulse rounded-full border border-accent-400/50"
          aria-hidden="true"
        />
      )}
      <Icon className="size-[1.125rem] text-accent-300" strokeWidth={1.5} aria-hidden="true" />
    </div>
  );
}
