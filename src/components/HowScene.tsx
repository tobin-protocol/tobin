"use client";

import {
  m,
  useMotionTemplate,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "motion/react";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { EXAMPLE, EXAMPLE_OBLIGATIONS, usd } from "@/lib/clearing";
import { HOW_CLOSING, HOW_STEPS } from "@/lib/how";
import { usePinned } from "@/lib/stage";
import { Container } from "./ui";

const icon = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

/*
 * The four stages. The closed strip keeps a pastel (the last one a solid), the
 * open card goes dark and speaks in the stage's colour. The small figures come
 * from the illustrative example, so they cannot drift from the rest of the page.
 */
const STAGES = [
  {
    ...HOW_STEPS[0],
    c: "var(--color-accent-bright)",
    bg: "var(--color-accent-pastel)",
    fg: "var(--color-ink)",
    tag: "bg-accent-bright text-ink",
    glyph: icon(
      <>
        <path d="M12 3v11m0 0l-4-4m4 4l4-4" />
        <path d="M5 15v3a2 2 0 002 2h10a2 2 0 002-2v-3" />
      </>,
    ),
    lines: EXAMPLE_OBLIGATIONS.map((o) => `${o.from} → ${o.to}   ${usd(o.amount)}`),
  },
  {
    ...HOW_STEPS[1],
    c: "var(--color-signal)",
    bg: "var(--color-signal-pastel)",
    fg: "var(--color-ink)",
    tag: "bg-signal text-ink",
    glyph: icon(
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="15" r="1.1" fill="currentColor" stroke="none" />
      </>,
    ),
    lines: [`${EXAMPLE_OBLIGATIONS.length} obligations → 1 session`, `gross ${usd(EXAMPLE.gross)}`],
  },
  {
    ...HOW_STEPS[2],
    c: "var(--color-coral)",
    bg: "var(--color-coral-pastel)",
    fg: "var(--color-ink)",
    tag: "bg-coral text-ink",
    glyph: icon(<path d="M4 6l8 6m8-6l-8 6m0 0v7" />),
    lines: EXAMPLE.positions.map(
      (p) => `${p.party} ${p.net < 0 ? "pays" : "receives"} ${usd(Math.abs(p.net))}`,
    ),
  },
  {
    // The result: a solid strip, so the eye lands on where it ends up.
    ...HOW_STEPS[3],
    c: "var(--color-accent-bright)",
    bg: "var(--color-accent)",
    fg: "var(--color-paper)",
    tag: "bg-accent-bright text-ink",
    glyph: icon(<path d="M5 12.5l4.5 4.5L19 7.5" />),
    lines: [`${usd(EXAMPLE.settled)} moves instead of ${usd(EXAMPLE.gross)}`],
  },
];

// Pinned timing (spec phases): stages advance over the first half of progress,
// then the scene pulls back underneath the next curtain.
const STAGE_AT = [0, 0.1, 0.2, 0.3];
const EXIT_FROM = 0.5;

const stageFor = (v: number) =>
  v >= STAGE_AT[3] ? 3 : v >= STAGE_AT[2] ? 2 : v >= STAGE_AT[1] ? 1 : 0;

/**
 * How It Works as a strip accordion. Headline left, paragraph right, then four
 * tall strips; the active one opens into a wide dark card. Hover, focus or tap
 * opens any strip. Pinned (wide, tall, no reduced motion): the section sticks
 * and scrolling advances the open strip along a progress rail, then the scene
 * blurs, dims and splits apart under the Stellar curtain.
 */
export function HowScene() {
  const pinned = usePinned();
  const outerRef = useRef<HTMLDivElement>(null);
  const lastStage = useRef(0);
  const [active, setActive] = useState(0);

  const { scrollYProgress: p } = useScroll({
    target: outerRef,
    offset: ["start start", "end end"],
  });

  // Scroll opens the strip for the stage it reaches; hovering overrides until the stage changes again.
  useMotionValueEvent(p, "change", (v) => {
    if (!pinned) return;
    const next = stageFor(v);
    if (next === lastStage.current) return;
    lastStage.current = next;
    setActive(next);
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

              <ol
                className="acc"
                style={pinned ? ({ "--acc-h": "clamp(19rem, calc(100svh - 27rem), 26rem)" } as CSSProperties) : undefined}
              >
                {STAGES.map((s, i) => {
                  const on = active === i;
                  return (
                    <li
                      key={s.title}
                      className="acc-item"
                      data-active={on}
                      style={{ "--c": s.c, "--acc-bg": s.bg, "--acc-fg": s.fg } as CSSProperties}
                    >
                      <button
                        type="button"
                        aria-expanded={on}
                        aria-label={`Stage ${i + 1}, ${s.title}. ${s.body} ${s.lines.join(", ")}`}
                        onMouseEnter={() => setActive(i)}
                        onFocus={() => setActive(i)}
                        onClick={() => setActive(i)}
                        className="acc-btn stage-tab"
                      >
                        {/* Closed: index, sideways title, the stage's glyph. */}
                        <span aria-hidden="true" className="acc-collapsed">
                          <span className="spaced tabular">0{i + 1}</span>
                          <span className="acc-vert">{s.title}</span>
                          {s.glyph}
                        </span>

                        {/* Open: tag, numeral, title, copy, the example's figures. */}
                        <span aria-hidden="true" className="acc-open">
                          <span className="flex items-center justify-between">
                            <span className={`rounded-full px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] ${s.tag}`}>
                              Stage 0{i + 1}
                            </span>
                            <span style={{ color: s.c }}>{s.glyph}</span>
                          </span>

                          <span className="mt-auto grid gap-6 md:grid-cols-[1fr_auto] md:items-end md:gap-10">
                            <span className="block">
                              <span className="block font-display text-[5rem] leading-none md:text-[7rem]" style={{ color: s.c }}>
                                0{i + 1}
                              </span>
                              <span className="mt-3 block text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">
                                {s.title}
                              </span>
                              <span className="mt-2 block max-w-[24rem] text-base leading-relaxed text-paper/80">
                                {s.body}
                              </span>
                            </span>
                            <span className="flex flex-col gap-1.5 md:min-w-[14rem]">
                              {s.lines.map((line) => (
                                <span
                                  key={line}
                                  className="tabular whitespace-pre rounded-lg bg-paper/10 px-3 py-1.5 font-mono text-xs font-semibold text-paper"
                                >
                                  {line}
                                </span>
                              ))}
                            </span>
                          </span>
                        </span>
                      </button>
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
