"use client";

import {
  m,
  useMotionTemplate,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "motion/react";
import { useRef, useState } from "react";
import { EXAMPLE, EXAMPLE_OBLIGATIONS, usd } from "@/lib/clearing";
import { HOW_CLOSING, HOW_STEPS } from "@/lib/how";
import { usePinned } from "@/lib/stage";
import { Container } from "./ui";

/*
 * The four stage cards. The small figures on each come from the illustrative
 * example, so they cannot drift from the rest of the page.
 */
const CARDS = [
  {
    ...HOW_STEPS[0],
    surface: "bg-accent-pastel text-ink",
    chip: "bg-ink/[0.07]",
    soft: "text-ink-soft",
    lines: EXAMPLE_OBLIGATIONS.map((o) => `${o.from} → ${o.to}   ${usd(o.amount)}`),
  },
  {
    ...HOW_STEPS[1],
    surface: "bg-signal-pastel text-ink",
    chip: "bg-ink/[0.07]",
    soft: "text-ink-soft",
    lines: [`${EXAMPLE_OBLIGATIONS.length} obligations → 1 session`, `gross ${usd(EXAMPLE.gross)}`],
  },
  {
    ...HOW_STEPS[2],
    surface: "bg-coral-pastel text-ink",
    chip: "bg-ink/[0.07]",
    soft: "text-ink-soft",
    lines: EXAMPLE.positions.map(
      (p) => `${p.party} ${p.net < 0 ? "pays" : "receives"} ${usd(Math.abs(p.net))}`,
    ),
  },
  {
    // The result: solid, so the eye lands on where it ends up.
    ...HOW_STEPS[3],
    surface: "bg-accent text-paper",
    chip: "bg-ink/[0.28]",
    soft: "text-paper",
    lines: [`${usd(EXAMPLE.settled)} moves instead of ${usd(EXAMPLE.gross)}`],
  },
];

// Pinned timing (spec phases): cards light up one by one over the first half of
// progress, then the scene pulls back underneath the next curtain.
const STAGE_AT = [0, 0.1, 0.2, 0.3];
const EXIT_FROM = 0.5;

const stageFor = (v: number) =>
  v >= STAGE_AT[3] ? 3 : v >= STAGE_AT[2] ? 2 : v >= STAGE_AT[1] ? 1 : 0;

/**
 * How It Works. Headline left, paragraph right, then four numbered cards.
 * Pinned (wide, tall, no reduced motion): the section sticks and scrolling
 * lifts each card in turn along a progress rail, then the scene blurs, dims
 * and splits apart under the Stellar curtain. Static everywhere else.
 */
export function HowScene() {
  const pinned = usePinned();
  const outerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const { scrollYProgress: p } = useScroll({
    target: outerRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(p, "change", (v) => {
    if (!pinned) return;
    const next = stageFor(v);
    setActive((prev) => (prev === next ? prev : next));
  });

  const rail = useTransform(p, [0, STAGE_AT[3]], [0, 1]);
  const x = useTransform(p, [EXIT_FROM, 1], [0, 1]);
  const scale = useTransform(x, [0, 1], [1, 0.9]);
  const y = useTransform(x, [0, 1], ["0px", "-40px"]);
  const blur = useTransform(x, [0, 1], [0, 4]);
  const bright = useTransform(x, [0, 1], [1, 0.5]);
  const filter = useMotionTemplate`blur(${blur}px) brightness(${bright})`;
  const headY = useTransform(x, [0, 0.8], ["0px", "-150px"]);
  const headO = useTransform(x, [0, 0.6], [1, 0]);
  const cardY = useTransform(x, [0, 0.8], ["0px", "150px"]);
  const cardO = useTransform(x, [0, 0.6], [1, 0]);

  return (
    <div ref={outerRef} className="pin-scene relative">
      <div className="pin-sticky py-24 md:py-32">
        <m.div style={pinned ? { scale, y, filter } : undefined} className="w-full origin-center">
          <Container>
            <m.div
              style={pinned ? { y: headY, opacity: headO } : undefined}
              className="grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-12"
            >
              <div className="lg:col-span-7">
                <p className="eyebrow">How Tobin works</p>
                <h2
                  id="how-title"
                  className="mt-4 text-[clamp(2.25rem,4.6vw,4.25rem)] font-bold leading-[1.02] tracking-[-0.035em] text-balance"
                >
                  Four stages,{" "}
                  <span className="bg-linear-to-br from-signal to-coral bg-clip-text text-transparent">
                    from obligation to settlement.
                  </span>
                </h2>
              </div>
              <p className="text-lead max-w-[32rem] lg:col-span-5">{HOW_CLOSING}</p>
            </m.div>

            <m.div
              style={pinned ? { y: cardY, opacity: cardO } : undefined}
              className="mt-10 md:mt-14"
            >
              {/* Progress rail: only meaningful while scroll is driving the stages. */}
              {pinned ? (
                <div aria-hidden="true" className="mb-5 h-[3px] w-full overflow-hidden rounded-full bg-paper/15">
                  <m.div style={{ scaleX: rail }} className="h-full origin-left rounded-full bg-signal" />
                </div>
              ) : null}

              <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {CARDS.map((c, i) => {
                  const on = pinned && active === i;
                  return (
                    <li
                      key={c.title}
                      aria-current={on ? "step" : undefined}
                      className={`flex min-h-[19rem] flex-col rounded-[1.75rem] p-6 transition-[transform,box-shadow] duration-500 ease-out sm:p-7 lg:min-h-[21rem] ${c.surface} ${on ? "-translate-y-3 shadow-[0_28px_60px_-24px_rgba(0,0,0,0.7)]" : ""}`}
                    >
                      <span className="font-display text-[4.5rem] leading-none sm:text-[5.5rem]">
                        0{i + 1}
                      </span>
                      <h3 className="text-heading mt-5">{c.title}</h3>
                      <p className={`mt-2 text-[0.9375rem] leading-relaxed ${c.soft}`}>{c.body}</p>

                      <div className="mt-auto flex flex-col gap-1.5 pt-6">
                        {c.lines.map((line) => (
                          <span
                            key={line}
                            className={`tabular whitespace-pre rounded-lg px-3 py-1.5 font-mono text-xs font-semibold ${c.chip}`}
                          >
                            {line}
                          </span>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ol>

              <p className="spaced mt-6 text-center text-paper/70 lg:text-left">
                Illustrative example · Not real transaction data
              </p>
            </m.div>
          </Container>
        </m.div>
      </div>
    </div>
  );
}
