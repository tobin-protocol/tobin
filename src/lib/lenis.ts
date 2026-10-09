import type Lenis from "lenis";

/** The active Lenis instance, if smooth scrolling is running (not under reduced motion). */
let instance: Lenis | null = null;

export const setLenis = (l: Lenis | null) => {
  instance = l;
};

/** Freeze or release page scroll (menus), whether or not Lenis is active. */
export function lockScroll(locked: boolean) {
  if (instance) locked ? instance.stop() : instance.start();
  document.documentElement.style.overflow = locked ? "hidden" : "";
}
