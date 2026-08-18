"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { trackEvent } from "@/lib/analytics/track";
import type { AnalyticsEventType } from "@/lib/analytics/types";

/**
 * Analytics Phase 7 — a Button-styled Link that fires a tracking event
 * before navigating. Used for the "_cta" click events
 * (service_project_cta, pricing_package_cta, maintenance_cta). Small
 * client wrapper around the shared Button, same convention as
 * OpenChatButton.tsx/ServiceAiCtaButton.tsx — never attaches onClick to
 * Button directly from a Server Component.
 */
export function TrackedCtaLink({
  href,
  eventType,
  serviceSlug,
  packageSlug,
  children,
  variant = "primary",
  size = "md",
  withArrow = false,
  className,
}: {
  href: string;
  eventType: AnalyticsEventType;
  serviceSlug?: string;
  packageSlug?: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  withArrow?: boolean;
  className?: string;
}) {
  function handleClick() {
    trackEvent(eventType, { serviceSlug, packageSlug });
  }

  return (
    <Button href={href} variant={variant} size={size} withArrow={withArrow} className={className} onClick={handleClick}>
      {children}
    </Button>
  );
}
