import type Lenis from "lenis";

/** The active Lenis instance, if smooth scrolling is running (not under reduced motion). */
let instance: Lenis | null = null;

export const setLenis = (l: Lenis | null) => {
  instance = l;
};

/** Scroll to an absolute page offset, through Lenis when it is running. */
export function scrollToY(y: number) {
  if (instance) instance.scrollTo(y);
  else window.scrollTo({ top: y });
}

/** Freeze or release page scroll (menus), whether or not Lenis is active. */
export function lockScroll(locked: boolean) {
  if (instance) {
    if (locked) instance.stop();
    else instance.start();
  }
  document.documentElement.style.overflow = locked ? "hidden" : "";
}
