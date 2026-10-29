"use client";

import { animate, m, useInView, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useReduceMotion } from "@/lib/stage";
import { LineReveal, Reveal } from "./Reveal";
import { ButtonLink, Container } from "./ui";

const ARC_W = 1004;
const ARC_H = 506;
const PATH = `M0 ${ARC_H} A502 ${ARC_H} 0 0 1 ${ARC_W} ${ARC_H}`;
// Phones (Ondo's mobile arc): a tall half circle on the right, the text sitting inside it.
// The orange node climbs down from the top and the black one up from the bottom; they meet at the
// bulge (the right-most point).
const M_R = 250;
const M_H = M_R * 2;
const M_PAD = 70; // the circle's centre, from the left edge of the arc box
const M_PATH = `M${M_PAD} 0 A${M_R} ${M_R} 0 0 1 ${M_PAD} ${M_H}`;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The idea of netting as decoration: a half-ellipse arc (a 1.5px stroke fading to
 * nothing at both feet) that two square nodes, "Gross" (orange, left) and "Net"
 * (black, right), climb to the apex over about 2.6s; the black one shrinks to 16px
 * and settles on the orange. A soft orange glow rises beneath. It carries no data and
 * makes no claim, is `aria-hidden`, and shows its end state under reduced motion.
 */
export function NettingArc() {
  const boxRef = useRef<HTMLDivElement>(null);
  const secRef = useRef<HTMLElement>(null);
  // The section, not the wide arc box: on phones that box is hidden and never intersects.
  const inView = useInView(secRef, { amount: 0.4 });
  const reduce = useReduceMotion();
  const [scale, setScale] = useState(1);
  const d = useMotionValue(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setScale(Math.min(1, el.clientWidth / ARC_W));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (reduce) {
      d.set(1);
      return;
    }
    if (!inView) return;
    // Loops for as long as it is on screen: the nodes meet, hold, then part and meet again.
    const controls = animate(d, 1, {
      duration: 2.1,
      ease: [0.45, 0, 0.25, 1],
      repeat: Infinity,
      repeatType: "reverse",
      repeatDelay: 1.1,
    });
    return () => controls.stop();
  }, [inView, reduce, d]);

  const orangeAt = useTransform(d, (v) => `${v * 50}%`);
  const purpleAt = useTransform(d, (v) => `${100 - v * 50}%`);
  const purpleSize = useTransform(d, (v) => 24 - 8 * clamp01((v - 0.7) / 0.3));
  const purpleRadius = useTransform(d, (v) => 4 - clamp01((v - 0.7) / 0.3));
  const glow = useTransform(d, (v) => clamp01((v - 0.6) / 0.4));
  const labels = useTransform(d, (v) => 1 - clamp01((v - 0.75) / 0.2));

  return (
    <section
      ref={secRef}
      id="netting"
      aria-labelledby="arc-title"
      data-surface="dark"
      className="surface-dark relative isolate min-h-[720px] overflow-hidden py-16 md:py-20 xl:py-[120px]"
    >
      {/* From 1024px the text sits inside the wide arc, under its apex. Below that it sits at the left, inside a tall half circle on the right. */}
      <div className="relative h-[560px] lg:block lg:h-auto">
        <Container className="absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-left lg:top-[40%] lg:translate-y-0 lg:text-center">
          <h2 id="arc-title" className="t-h3 max-w-[11ch] text-balance lg:mx-auto lg:max-w-[22ch]">
            <LineReveal
              lines={[
                "Obligations in many directions.",
                { text: "One net settlement.", className: "text-grey-400" },
              ]}
            />
          </h2>
          <Reveal delay={0.25} className="mt-8">
            <ButtonLink href="#source" variant="light" className="w-[160px] lg:w-[180px]">
              View the source
            </ButtonLink>
          </Reveal>
        </Container>

      {/* Phones: the half circle and its two nodes. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-full overflow-hidden lg:hidden">
        <div className="relative" style={{ width: M_PAD + M_R + 12, height: M_H, top: (560 - M_H) / 2 }}>
          <svg viewBox={`0 0 ${M_PAD + M_R + 12} ${M_H}`} width={M_PAD + M_R + 12} height={M_H} className="absolute inset-0 overflow-visible">
            <defs>
              <linearGradient id="arc-grad-m" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: "var(--color-arc-orange)", stopOpacity: 0 }} />
                <stop offset="0.5" style={{ stopColor: "var(--color-arc-orange)" }} />
                <stop offset="1" style={{ stopColor: "var(--color-arc-orange)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <path d={M_PATH} fill="none" stroke="url(#arc-grad-m)" strokeWidth={1.5} />
          </svg>
          <m.div
            className="arc-node arc-node-orange h-5 w-5 rounded-[4px]"
            style={{ offsetPath: `path("${M_PATH}")`, offsetDistance: orangeAt }}
          />
          <m.div
            className="arc-node arc-node-purple"
            style={{
              offsetPath: `path("${M_PATH}")`,
              offsetDistance: purpleAt,
              width: purpleSize,
              height: purpleSize,
              borderRadius: purpleRadius,
            }}
          />
        </div>
      </div>

      <div aria-hidden="true" className="pointer-events-none relative mt-10 hidden lg:mt-0 lg:block">
        <m.div
          className="arc-glow absolute left-1/2 top-1/2 -z-10 h-[995px] w-[995px] max-w-none -translate-x-1/2 rounded-full"
          style={{ opacity: glow }}
        />
        <div ref={boxRef} className="mx-auto w-full" style={{ maxWidth: ARC_W, height: ARC_H * scale }}>
          <div
            className="relative origin-top-left"
            style={{ width: ARC_W, height: ARC_H, transform: `scale(${scale})` }}
          >
            <svg viewBox={`0 0 ${ARC_W} ${ARC_H}`} width={ARC_W} height={ARC_H} className="absolute inset-0 overflow-visible">
              <defs>
                <linearGradient id="arc-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" style={{ stopColor: "var(--color-purple)", stopOpacity: 0 }} />
                  <stop offset="0.2" style={{ stopColor: "var(--color-purple)" }} />
                  <stop offset="0.45" style={{ stopColor: "var(--color-arc-lilac)" }} />
                  <stop offset="0.65" style={{ stopColor: "var(--color-arc-peach)" }} />
                  <stop offset="0.85" style={{ stopColor: "var(--color-arc-orange)" }} />
                  <stop offset="1" style={{ stopColor: "var(--color-arc-orange)", stopOpacity: 0 }} />
                </linearGradient>
              </defs>
              <path d={PATH} fill="none" stroke="url(#arc-grad)" strokeWidth={1.5} />
            </svg>
            <m.div
              className="arc-node arc-node-orange h-6 w-6 rounded-[4px]"
              style={{ offsetPath: `path("${PATH}")`, offsetDistance: orangeAt }}
            >
              <m.span
                className="t-label absolute right-full top-1/2 mr-3 -translate-y-1/2 text-paper"
                style={{ opacity: labels }}
              >
                Gross
              </m.span>
            </m.div>
            <m.div
              className="arc-node arc-node-purple"
              style={{
                offsetPath: `path("${PATH}")`,
                offsetDistance: purpleAt,
                width: purpleSize,
                height: purpleSize,
                borderRadius: purpleRadius,
              }}
            >
              <m.span
                className="t-label absolute left-full top-1/2 ml-3 -translate-y-1/2 text-paper"
                style={{ opacity: labels }}
              >
                Net
              </m.span>
            </m.div>
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}
