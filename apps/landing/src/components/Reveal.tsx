"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";

/**
 * Entrance: opacity plus a 30px rise, once, at 10% visibility (spec timing:
 * 0.6s `ease`). MotionConfig(reducedMotion="user") turns the rise into a fade.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay }}
    >
      {children}
    </m.div>
  );
}

/** A bar that grows from its left edge (transform only) when scrolled into view. */
export function GrowBar({
  scale,
  className,
  delay = 0,
}: {
  scale: number;
  className?: string;
  delay?: number;
}) {
  return (
    <m.div
      className={`origin-left ${className ?? ""}`}
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: scale }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ type: "spring", bounce: 0, duration: 0.9, delay }}
    />
  );
}
