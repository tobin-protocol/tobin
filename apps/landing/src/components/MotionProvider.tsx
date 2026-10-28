"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";

/**
 * One feature bundle for the whole page (animate, in-view, tap/hover), loaded
 * lazily so components use the small `m` primitive. `reducedMotion="user"`
 * drops transform animation for people who ask for it and keeps opacity.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
