"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger delay in seconds — used when revealing a list of siblings. */
  delay?: number;
  /** Subtle vertical offset the content animates in from. */
  offset?: number;
}

/**
 * Scroll-triggered fade + rise, used sparingly for section headers and grid
 * items. Respects prefers-reduced-motion by disabling the transform entirely.
 */
export function Reveal({ children, className, delay = 0, offset = 16 }: RevealProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduceMotion ? 0 : offset }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
