"use client";

import { m, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";
import { usePinned } from "@/lib/stage";

const surfaces = {
  paper: { section: "bg-paper", wave: "fill-paper" },
  signal: { section: "bg-signal text-ink", wave: "fill-signal" },
} as const;

/**
 * A section that rides up over the pinned scene before it (`pin-curtain`) and
 * wears a wavy top edge. The wave is 400% wide and repeats every quarter, so
 * sliding it by -25% as the curtain enters moves it exactly one period and the
 * seam never shows. Statically (narrow, short, reduced motion) it just sits.
 */
export function Curtain({
  id,
  label,
  surface = "paper",
  className = "",
  children,
}: {
  id: string;
  label: string;
  surface?: keyof typeof surfaces;
  className?: string;
  children: ReactNode;
}) {
  const tone = surfaces[surface];
  const ref = useRef<HTMLElement>(null);
  const pinned = usePinned();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "start start"],
  });
  const waveX = useTransform(scrollYProgress, [0, 1], ["0%", "-25%"]);

  return (
    <section
      ref={ref}
      id={id}
      aria-labelledby={label}
      data-nav-tone="light"
      data-nav-lead="60"
      data-surface={surface === "paper" ? undefined : surface}
      className={`pin-curtain relative z-20 overflow-x-clip ${tone.section} ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 w-full -translate-y-[99%] overflow-hidden"
      >
        <m.svg
          viewBox="0 0 2880 200"
          preserveAspectRatio="none"
          style={pinned ? { x: waveX } : undefined}
          className={`h-[70px] w-[400%] origin-left ${tone.wave} sm:h-[110px] md:h-[150px]`}
        >
          <path d="M 0 200 L 0 100 C 120 50, 240 50, 360 100 S 600 150, 720 100 S 960 50, 1080 100 S 1320 150, 1440 100 S 1680 50, 1800 100 S 2040 150, 2160 100 S 2400 50, 2520 100 S 2760 150, 2880 100 L 2880 200 Z" />
        </m.svg>
      </div>
      {children}
    </section>
  );
}
