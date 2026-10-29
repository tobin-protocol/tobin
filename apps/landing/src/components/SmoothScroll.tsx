"use client";

import type Lenis from "lenis";
import { useEffect } from "react";
import { setLenis } from "@/lib/lenis";
import { PIN_QUERY } from "@/lib/stage";

/**
 * Lenis smooth scroll, 1.6s with a wheel multiplier of 0.8 (calmer than the
 * library's usual 2.5s / 0.6). It runs only where the pinned scenes run (the
 * PIN_QUERY: wide, tall, no reduced-motion preference); every other layout is
 * the static one, with native scrolling. The library is loaded on demand, so
 * phones never download it.
 */
export function SmoothScroll() {
  useEffect(() => {
    const mq = window.matchMedia(PIN_QUERY);
    let lenis: Lenis | null = null;
    let starting = false;
    let disposed = false;

    const start = async () => {
      if (lenis || starting) return;
      starting = true;
      const { default: LenisClass } = await import("lenis");
      starting = false;
      // The query may have changed, or the component unmounted, while the import ran.
      if (disposed || !mq.matches || lenis) return;
      lenis = new LenisClass({
        autoRaf: true,
        duration: 1.6,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // easeOutExpo
        orientation: "vertical",
        gestureOrientation: "vertical",
        smoothWheel: true,
        wheelMultiplier: 0.8,
        touchMultiplier: 2,
        anchors: { offset: -72 }, // clears the fixed navigation
      });
      setLenis(lenis);
    };
    const stop = () => {
      lenis?.destroy();
      lenis = null;
      setLenis(null);
    };
    const onChange = () => (mq.matches ? void start() : stop());

    if (mq.matches) void start();
    mq.addEventListener("change", onChange);
    return () => {
      disposed = true;
      mq.removeEventListener("change", onChange);
      stop();
    };
  }, []);

  return null;
}
