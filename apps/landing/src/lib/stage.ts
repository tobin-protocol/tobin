"use client";

import { useSyncExternalStore } from "react";

/**
 * Pinned (sticky) scenes need room: a wide, reasonably tall viewport
 * and no reduced-motion preference. Everywhere else the page falls back to a
 * plain static layout. The same query is repeated in globals.css (`.pin-*`).
 */
export const PIN_QUERY =
  "(min-width: 1024px) and (min-height: 700px) and (prefers-reduced-motion: no-preference)";

/**
 * The hero fold, the nav and the status banner need less room than the content scenes (the clearing
 * showcase board needs about 700px), so they fold from 600px of height. Repeated in globals.css (the
 * `.hero` and `.nav-bar` rules).
 */
export const HERO_PIN_QUERY =
  "(min-width: 1024px) and (min-height: 600px) and (prefers-reduced-motion: no-preference)";

/**
 * The compact (phone and small tablet) hero: the same fold as the pinned layout, laid out
 * vertically (the headline splits above and below a rounded square). Repeated in globals.css
 * (the `.hero` and `.nav-bar` rules). Never true together with PIN_QUERY.
 */
export const COMPACT_QUERY =
  "(max-width: 1023px) and (min-height: 600px) and (prefers-reduced-motion: no-preference)";

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * One shared MediaQueryList and one listener set per query. A page with dozens of
 * components that read these preferences would otherwise create dozens of
 * MediaQueryLists and listeners while it hydrates.
 */
function mediaStore(query: string) {
  const listeners = new Set<() => void>();
  let mq: MediaQueryList | null = null;
  const onChange = () => listeners.forEach((l) => l());
  return {
    subscribe(listener: () => void) {
      if (!mq) {
        mq = window.matchMedia(query);
        mq.addEventListener("change", onChange);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && mq) {
          mq.removeEventListener("change", onChange);
          mq = null;
        }
      };
    },
    get: () => (mq ?? window.matchMedia(query)).matches,
  };
}

const pinStore = mediaStore(PIN_QUERY);
const heroPinStore = mediaStore(HERO_PIN_QUERY);
const reduceStore = mediaStore(REDUCE_QUERY);
const compactStore = mediaStore(COMPACT_QUERY);

/** False on the server and until hydration, so the static layout is the default. */
export function usePinned() {
  return useSyncExternalStore(pinStore.subscribe, pinStore.get, () => false);
}

/** Like usePinned, for the hero, nav and status banner (HERO_PIN_QUERY). */
export function useHeroPinned() {
  return useSyncExternalStore(heroPinStore.subscribe, heroPinStore.get, () => false);
}

/** True on phones and small tablets (see COMPACT_QUERY); false on the server and until hydration. */
export function useCompact() {
  return useSyncExternalStore(compactStore.subscribe, compactStore.get, () => false);
}

/**
 * Reduced-motion preference that is safe to render with: false on the server
 * and during hydration, then the real value, so markup never mismatches.
 */
export function useReduceMotion() {
  return useSyncExternalStore(reduceStore.subscribe, reduceStore.get, () => false);
}
