"use client";

import { m, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";
import { usePinned } from "@/lib/stage";

/**
 * Hero as a pinned scene. The wrapper is 200vh tall; the section inside sticks
 * for the first 100vh of scrolling while the ink curtain rises over it, and
 * during that time it pulls back. Spec: scale 1>.8, rotate 0>2deg, opacity
 * 1>.1. This brand is calmer, so: .9 / 1deg / .2. Only transform + opacity.
 */
export function HeroStage({
  children,
  labelledBy,
}: {
  children: ReactNode;
  labelledBy: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = usePinned();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.9]);
  const rotate = useTransform(scrollYProgress, [0, 0.5], [0, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0.2]);

  // Ink sits behind the blue, so the scene reads as a card being pulled away.
  return (
    <div ref={ref} className="pin-stage relative bg-navy" style={{ zIndex: 1 }}>
      <m.section
        aria-labelledby={labelledBy}
        data-surface="accent"
        data-nav-tone="accent"
        className="pin-sticky relative origin-center overflow-hidden bg-accent pb-24 pt-28 text-paper sm:pt-32 md:pb-28 lg:pt-32"
        style={pinned ? { scale, rotate, opacity } : undefined}
      >
        {children}
      </m.section>
    </div>
  );
}
