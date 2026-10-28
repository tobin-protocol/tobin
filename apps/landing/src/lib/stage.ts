"use client";

import { useSyncExternalStore } from "react";

/**
 * Pinned (sticky) scroll scenes need room: a wide, reasonably tall viewport
 * and no reduced-motion preference. Everywhere else the page falls back to a
 * plain static layout. The same query is repeated in globals.css (`.pin-*`).
 */
export const PIN_QUERY =
  "(min-width: 1024px) and (min-height: 700px) and (prefers-reduced-motion: no-preference)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(PIN_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** False on the server and until hydration, so the static layout is the default. */
export function usePinned() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PIN_QUERY).matches,
    () => false,
  );
}

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduce(onChange: () => void) {
  const mq = window.matchMedia(REDUCE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * Reduced-motion preference that is safe to render with: false on the server
 * and during hydration, then the real value, so markup never mismatches.
 */
export function useReduceMotion() {
  return useSyncExternalStore(
    subscribeReduce,
    () => window.matchMedia(REDUCE_QUERY).matches,
    () => false,
  );
}
