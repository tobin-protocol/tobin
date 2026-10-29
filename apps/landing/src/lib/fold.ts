"use client";

import { motionValue } from "motion/react";
import { useEffect } from "react";

/**
 * Shared state of the hero fold. The hero stage writes its scroll progress
 * (0 to 1 across the pinned distance); the nav reads it to fade in and narrow
 * into its pill. The viewport size is shared so derived values can be pixels.
 * Module-level so both client trees see the same values.
 */
export const foldProgress = motionValue(0);
export const viewportW = motionValue(1440);
export const viewportH = motionValue(900);
/**
 * The shortest stage the pinned hero is laid out for. A shorter window (or a zoomed-in page) gets a hero this
 * tall instead, so the fold keeps its proportions and the page scrolls to the rest of it. Repeated in
 * globals.css (`.hero`).
 */
export const MIN_STAGE_H = 700;
/** 1 while the compact (phone) hero layout is active, else 0; the hero writes it, its transforms read it. */
export const compactMode = motionValue(0);

/** Ease for derived fold values: cubic-bezier(0.65, 0, 0.35, 1). */
export const FOLD_EASE = [0.65, 0, 0.35, 1] as const;

/** Keeps `viewportW` / `viewportH` current. Call from any component that reads them. */
export function useViewportSync() {
  useEffect(() => {
    const sync = () => {
      viewportW.set(window.innerWidth);
      viewportH.set(Math.max(window.innerHeight, MIN_STAGE_H));
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);
}
