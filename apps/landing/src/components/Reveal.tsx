"use client";

import { m, useInView, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";
import { useReduceMotion } from "@/lib/stage";

/**
 * Card entrance: fade plus a rise of 12 to 56px (32px by default), a slide in from the left
 * or right, or a grow from 94% (`from`), once, ease-out; a second card in a grid lags with `delay`. Under prefers-reduced-motion
 * the content simply renders.
 */
export type RevealFrom = "up" | "left" | "right" | "scale";

export function Reveal({
  children,
  delay = 0,
  rise = 32,
  from = "up",
  className,
}: {
  children: ReactNode;
  delay?: number;
  rise?: number;
  /** Where the content comes from: rising, sliding in from a side, or growing from 94%. */
  from?: RevealFrom;
  className?: string;
}) {
  const reduce = useReduceMotion();
  if (reduce) return <div className={className}>{children}</div>;
  const start =
    from === "left"
      ? { opacity: 0, x: -64 }
      : from === "right"
        ? { opacity: 0, x: 64 }
        : from === "scale"
          ? { opacity: 0, scale: 0.94, y: 24 }
          : { opacity: 0, y: Math.min(56, rise) };
  return (
    <m.div
      className={className}
      initial={start}
      whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: from === "up" ? 0.33 : 0.55, ease: "easeOut", delay }}
    >
      {children}
    </m.div>
  );
}

export type Line = string | { text: string; className?: string };

function MaskedLine({ text, className, index }: { text: string; className: string; index: number }) {
  // Observe the mask, not the moving text: the text starts translated out of the mask, so
  // an observer on the text itself would never see it enter the viewport.
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, amount: "some" });
  return (
    <span ref={ref} className={`block overflow-hidden pb-[0.1em] ${className}`}>
      <m.span
        className="block"
        initial={false}
        animate={seen ? { y: "0%", opacity: 1 } : { y: "105%", opacity: 0.25 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1], delay: index * 0.06 }}
      >
        {text}
      </m.span>
    </span>
  );
}

/**
 * Line reveal: each line rises out of an overflow mask and brightens from grey,
 * 0.5s, staggered per line, once. The lines are separate blocks, so the caller
 * chooses where they break, and a line can carry its own class (the grey second
 * phrase of a two-tone heading). Under reduced motion the lines render as they are.
 */
export function LineReveal({ lines, className }: { lines: Line[]; className?: string }) {
  const reduce = useReduceMotion();
  return (
    <span className={className}>
      {lines.map((line, i) => {
        const text = typeof line === "string" ? line : line.text;
        const cls = typeof line === "string" ? "" : (line.className ?? "");
        return reduce ? (
          <span key={text} className={`block ${cls}`}>
            {text}
          </span>
        ) : (
          <MaskedLine key={text} text={text} className={cls} index={i} />
        );
      })}
    </span>
  );
}

/**
 * Scroll-linked drift: the content moves `distance` px (up to this much each way) against the
 * page as its box crosses the viewport, so it seems to sit deeper than its neighbours. Used on
 * photographs inside overflow-hidden frames (scale them up a little so no edge shows). Nothing
 * happens under reduced motion.
 */
export function Parallax({
  children,
  distance = 60,
  className,
}: {
  children: ReactNode;
  distance?: number;
  className?: string;
}) {
  const reduce = useReduceMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [-distance, distance]);
  return (
    <div ref={ref} className={className}>
      <m.div className="h-full w-full" style={reduce ? undefined : { y }}>
        {children}
      </m.div>
    </div>
  );
}

/**
 * Mask reveal: the content rises out of an overflow mask (it starts fully below its own box and
 * slides up into it), once, as it scrolls into view. Good for one big line such as a wordmark.
 * Under reduced motion it just renders.
 */
export function MaskReveal({
  children,
  delay = 0,
  duration = 1,
  className,
}: {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const reduce = useReduceMotion();
  // Observe the mask box, not the moving content: the content starts translated out of the mask,
  // so an observer on it would never see it enter the viewport.
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.2 });
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <div ref={ref} className={`overflow-hidden ${className ?? ""}`}>
      <m.div
        initial={false}
        animate={{ y: seen ? "0%" : "105%" }}
        transition={{ duration, ease: [0.16, 1, 0.3, 1], delay }}
      >
        {children}
      </m.div>
    </div>
  );
}
