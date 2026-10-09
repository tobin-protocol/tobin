"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";

/**
 * Subtle entrance: opacity plus a short rise, once, critically damped.
 * MotionConfig(reducedMotion="user") turns the rise into a plain fade.
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
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ type: "spring", bounce: 0, duration: 0.7, delay }}
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
