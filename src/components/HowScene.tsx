"use client";

import {
  m,
  useMotionValueEvent,
  useMotionTemplate,
  useScroll,
  useTransform,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EXAMPLE, EXAMPLE_OBLIGATIONS, usd } from "@/lib/clearing";
import { HOW_CLOSING, HOW_STEPS } from "@/lib/how";
import { usePinned } from "@/lib/stage";
import { Container } from "./ui";

/*
 * The session log. Every figure comes from the illustrative example, so it
 * can never drift from the rest of the page.
 */
const pad = (s: string, n: number) => s.padEnd(n, " ");

const BLOCKS = [
  {
    ...HOW_STEPS[0],
    lines: EXAMPLE_OBLIGATIONS.map(
      (o) => `${o.from} → ${o.to}   ${usd(o.amount)}`,
    ),
  },
  {
    ...HOW_STEPS[1],
    lines: [
      `session   ${EXAMPLE_OBLIGATIONS.length} obligations · gross ${usd(EXAMPLE.gross)}`,
    ],
  },
  {
    ...HOW_STEPS[2],
    lines: EXAMPLE.positions.map(
      (p) =>
        `${p.party}  ${pad(p.net < 0 ? "pays" : "receives", 9)}${usd(Math.abs(p.net))}   (owes ${usd(p.owes)}, owed ${usd(p.owed)})`,
    ),
  },
  {
    ...HOW_STEPS[3],
    lines: [`settled   ${usd(EXAMPLE.settled)} moves instead of ${usd(EXAMPLE.gross)}`],
  },
];

// Timing (spec): the log scrolls over the first half of progress, then the whole
// scene pulls back underneath the next curtain over the second half.
const EXIT_FROM = 0.5;

/**
 * How It Works as a pinned "file window" scene (the spec's skills scene).
 * Pinned: the section sticks, scrolling reads the log top to bottom, the
 * active stage is highlighted, then the scene blurs, dims and splits apart.
 * Static (narrow, short, reduced motion): the same window, fully visible.
 */
export function HowScene() {
  const pinned = usePinned();
  const outerRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const maxScroll = useRef(0);
  const blockEls = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);

  const { scrollYProgress: p } = useScroll({
    target: outerRef,
    offset: ["start start", "end end"],
  });

  // How far the log can travel: its height minus the window's.
  useEffect(() => {
    const measure = () => {
      const w = windowRef.current;
      const l = logRef.current;
      if (w && l) maxScroll.current = Math.max(0, l.scrollHeight - w.clientHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (windowRef.current) ro.observe(windowRef.current);
    if (logRef.current) ro.observe(logRef.current);
    return () => ro.disconnect();
  }, [pinned]);

  const logY = useTransform(() => -Math.min(p.get() / EXIT_FROM, 1) * maxScroll.current);

  useMotionValueEvent(p, "change", (v) => {
    if (!pinned) return;
    const scrolled = Math.min(v / EXIT_FROM, 1) * maxScroll.current;
    const line = (windowRef.current?.clientHeight ?? 0) * 0.4;
    let next = 0;
    blockEls.current.forEach((el, i) => {
      if (el && el.offsetTop - scrolled <= line) next = i;
    });
    // The last block can never climb to the highlight line; once the log has
    // run out of road, the final stage is the active one.
    if (maxScroll.current > 0 && scrolled >= maxScroll.current - 4) next = BLOCKS.length - 1;
    setActive((prev) => (prev === next ? prev : next));
  });

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
        <m.div
          style={pinned ? { scale, y, filter } : undefined}
          className="w-full origin-center"
        >
          <Container>
            <m.div
              style={pinned ? { y: headY, opacity: headO } : undefined}
              className="mx-auto mb-10 max-w-4xl text-center md:mb-12"
            >
              <p className="eyebrow">How Tobin works</p>
              <h2
                id="how-title"
                className="mt-4 text-[clamp(2.25rem,4.4vw,4rem)] font-bold leading-[1.02] tracking-[-0.035em] text-balance"
              >
                Four stages,{" "}
                <span className="bg-linear-to-br from-signal to-coral bg-clip-text text-transparent">
                  from obligation to settlement.
                </span>
              </h2>
              <p className="text-lead mx-auto mt-5 max-w-2xl">{HOW_CLOSING}</p>
            </m.div>

            <m.div
              style={pinned ? { y: cardY, opacity: cardO } : undefined}
              className="mx-auto w-full max-w-4xl"
            >
              <div className="overflow-hidden rounded-[2rem] border border-paper/10 bg-black/45 shadow-[0_40px_100px_rgba(0,0,0,0.6)]">
                {/* Title bar */}
                <div className="flex items-center justify-between gap-4 border-b border-paper/10 bg-paper/5 px-5 py-4 sm:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-signal" aria-hidden="true">
                      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
                      <path d="M14 3v5h5M9 13h6M9 17h4" />
                    </svg>
                    <span className="truncate font-mono text-sm font-semibold tracking-wide text-paper/80">
                      clearing-session.txt
                    </span>
                    <span className="hidden shrink-0 rounded-full border border-signal/30 bg-signal/20 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-signal sm:inline">
                      Illustrative
                    </span>
                  </div>
                  <span className="tabular shrink-0 rounded-lg bg-signal px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-ink">
                    {pinned ? `Stage 0${active + 1} / 04` : "4 stages"}
                  </span>
                </div>

                {/* Window: the log scrolls inside it when pinned */}
                <div ref={windowRef} className="pin-window relative bg-accent text-paper">
                  <m.div
                    ref={logRef}
                    style={pinned ? { y: logY } : undefined}
                    className="relative p-6 font-mono text-[0.8125rem] leading-[1.9] sm:p-8 sm:text-sm"
                  >
                    <p className="whitespace-pre-wrap">{"# Tobin clearing session"}</p>
                    <p className="whitespace-pre-wrap">{"# Illustrative example · not real transaction data"}</p>
                    <p className="mt-2">---</p>

                    {BLOCKS.map((b, i) => {
                      const on = pinned && active === i;
                      return (
                        <div
                          key={b.title}
                          ref={(el) => {
                            blockEls.current[i] = el;
                          }}
                          className={`-mx-6 mt-4 border-l-2 px-[1.375rem] py-3 transition-colors duration-300 sm:-mx-8 sm:px-[1.875rem] ${on ? "border-signal bg-ink/30" : "border-transparent"}`}
                        >
                          <p className="font-bold">
                            {"› "}stage 0{i + 1} · {b.title.toLowerCase()}
                          </p>
                          <p className="whitespace-pre-wrap pl-4 text-paper">{b.body}</p>
                          {b.lines.map((line) => (
                            <p key={line} className="whitespace-pre-wrap pl-4 font-semibold">
                              {line}
                            </p>
                          ))}
                        </div>
                      );
                    })}

                    <p className="mt-4">---</p>
                    <p>{"# end of session"}</p>
                  </m.div>
                </div>
              </div>
            </m.div>
          </Container>
        </m.div>
      </div>
    </div>
  );
}
