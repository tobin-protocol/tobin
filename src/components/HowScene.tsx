"use client";

import {
  m,
  useMotionTemplate,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "motion/react";
import { useRef, useState } from "react";
import { HOW_CLOSING, HOW_STEPS } from "@/lib/how";
import { scrollToY } from "@/lib/lenis";
import { ClearingVisual, type Stage } from "./ClearingVisual";
import { Container } from "./ui";

/*
 * Scroll phases. The wrapper is 400vh; the next block (a curtain) covers its
 * last viewport, so the stages play out over the first two thirds of progress
 * and the exit plays underneath the curtain.
 */
const STAGE_AT = [0, 0.1, 0.27, 0.44]; // progress where each stage begins
const EXIT_FROM = 2 / 3;

const stageFor = (p: number): Stage =>
  p >= STAGE_AT[3] ? 3 : p >= STAGE_AT[2] ? 2 : p >= STAGE_AT[1] ? 1 : 0;

/**
 * How It Works as a pinned scene: the section sticks, scrolling steps the
 * clearing visual through Submit > Clear > Net > Settle, then the scene pulls
 * back (spec: scale 1>.9, y -40px, blur 0>4px, brightness 1>.5; blur trimmed
 * to 3px here) while the Stellar curtain rises over it.
 */
export function HowScene() {
  const ref = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>(0);
  const { scrollYProgress: p } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(p, "change", (v) => {
    const next = stageFor(v);
    setStage((prev) => (prev === next ? prev : next));
  });

  const x = useTransform(p, [EXIT_FROM, 1], [0, 1]);
  const scale = useTransform(x, [0, 1], [1, 0.9]);
  const y = useTransform(x, [0, 1], ["0px", "-40px"]);
  const blur = useTransform(x, [0, 1], [0, 3]);
  const bright = useTransform(x, [0, 1], [1, 0.5]);
  const filter = useMotionTemplate`blur(${blur}px) brightness(${bright})`;
  const headY = useTransform(x, [0, 0.8], ["0px", "-120px"]);
  const headO = useTransform(x, [0, 0.6], [1, 0]);
  const cardY = useTransform(x, [0, 0.8], ["0px", "120px"]);
  const cardO = useTransform(x, [0, 0.6], [1, 0]);
  const rail = useTransform(p, [0, STAGE_AT[3]], [0, 1]);

  // Steps are buttons: jump the scroll to the middle of that stage's range.
  const goTo = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const next = STAGE_AT[i + 1] ?? EXIT_FROM;
    const target = (STAGE_AT[i] + Math.min(next, EXIT_FROM)) / 2;
    const top = el.getBoundingClientRect().top + window.scrollY;
    scrollToY(top + target * (el.offsetHeight - window.innerHeight));
  };

  return (
    <div ref={ref} className="relative h-[400vh]">
      <div className="pin-sticky">
        <m.div style={{ scale, y, filter }} className="w-full origin-center">
          <Container className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
            <m.div style={{ y: headY, opacity: headO }} className="lg:col-span-5">
              <p className="eyebrow">How Tobin works</p>
              <h2
                id="how-title-pinned"
                className="mt-4 text-[clamp(2rem,3.4vw,3rem)] font-[620] leading-[1.04] tracking-[-0.035em] text-balance"
              >
                Four stages, from obligation to settlement.
              </h2>

              <ol className="relative mt-9">
                <span aria-hidden="true" className="absolute bottom-1 left-[0.6875rem] top-1 w-px bg-paper/20" />
                <m.span
                  aria-hidden="true"
                  style={{ scaleY: rail }}
                  className="absolute bottom-1 left-[0.6875rem] top-1 w-px origin-top bg-accent-bright"
                />
                {HOW_STEPS.map((s, i) => {
                  const active = stage === i;
                  return (
                    <li key={s.title} aria-current={active ? "step" : undefined}>
                      <button
                        type="button"
                        onClick={() => goTo(i)}
                        className="stage-tab flex w-full items-start gap-5 rounded-lg py-2.5 text-left"
                      >
                        <span
                          className={`relative z-10 mt-0.5 flex h-[1.4375rem] w-[1.4375rem] shrink-0 items-center justify-center rounded-full font-mono text-[0.625rem] transition-colors duration-300 ${i <= stage ? "bg-accent-bright text-ink" : "bg-ink text-paper/60 ring-1 ring-paper/25"}`}
                        >
                          {i + 1}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={`text-heading block transition-opacity duration-300 ${active ? "opacity-100" : "opacity-45"}`}
                          >
                            {s.title}
                          </span>
                          <span
                            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${active ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                          >
                            <span className="text-body block overflow-hidden">{s.body}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              <p className="mt-6 max-w-[26rem] text-[0.9375rem] leading-relaxed text-paper/70">
                {HOW_CLOSING}
              </p>
            </m.div>

            <m.div style={{ y: cardY, opacity: cardO }} className="lg:col-span-7">
              <div className="mx-auto w-full max-w-[30rem]">
                <ClearingVisual stage={stage} fit />
              </div>
            </m.div>
          </Container>
        </m.div>
      </div>
    </div>
  );
}
