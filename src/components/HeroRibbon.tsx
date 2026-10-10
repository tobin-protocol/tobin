"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EXAMPLE, EXAMPLE_OBLIGATIONS, usd } from "@/lib/clearing";
import { useReduceMotion } from "@/lib/stage";

/*
 * Kinetic ribbon (spec path: a thick band that sweeps across, loops once on
 * the right and leaves). Text crawls along it and, every 15s, a bright pulse
 * draws itself down its length. It is purely decorative, so the whole layer
 * is aria-hidden; the headline carries the meaning.
 */
const POINTS = [
  { x: -250, y: 350 },
  { x: 213, y: 153 }, { x: 500, y: 400 }, { x: 750, y: 500 },
  { x: 945, y: 610 }, { x: 1400, y: 707 }, { x: 1414, y: 570 },
  { x: 1423, y: 488 }, { x: 1294, y: 489 }, { x: 1312, y: 574 },
  { x: 1319, y: 613 }, { x: 1372, y: 668 }, { x: 1850, y: 650 },
];

const toPath = ([p0, ...rest]: typeof POINTS) =>
  rest.reduce(
    (d, _, i) =>
      i % 3 === 0 && rest[i + 2]
        ? `${d} C ${rest[i].x} ${rest[i].y}, ${rest[i + 1].x} ${rest[i + 1].y}, ${rest[i + 2].x} ${rest[i + 2].y}`
        : d,
    `M ${p0.x} ${p0.y}`,
  );

const PATH = toPath(POINTS);

// The whole ribbon rides lower than the spec so it runs behind the bottom of the
// headline and under the buttons, leaving the top band and the copy column clear.
const DROP = 150;
// The pill sits where the ribbon first crosses this x: the empty left margin.
const PILL_X = 100;

// The product's own vocabulary, repeated along the band.
const CRAWL =
  "OBLIGATIONS · CLEARING · NETTING · SETTLEMENT · SOROBAN · STELLAR · SEP-31 · DETERMINISTIC · OPEN PROTOCOL · ".repeat(8);

// Pill captions come from the illustrative example, so they stay in sync with it.
const CAPTIONS = [
  ...EXAMPLE_OBLIGATIONS.map((o) => ({ text: `${o.from} owes ${o.to} ${usd(o.amount)}`, rotate: 0 })),
  { text: `Only ${usd(EXAMPLE.settled)} moves\n(illustrative)`, rotate: -8 },
];

const barHeight = (_: number, i: number) =>
  Math.max(0.15, (1 - Math.abs(i - 5) / 5) * (0.3 + 0.7 * Math.random()));

/** A cream-style pill with a live equalizer; captions pop out of it. */
function ClearingPill({ animated }: { animated: boolean }) {
  const [bars, setBars] = useState<number[]>(() => Array(11).fill(0.55));
  const [idx, setIdx] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!animated) return;
    const t = setInterval(() => setBars((b) => b.map(barHeight)), 200);
    return () => clearInterval(t);
  }, [animated]);

  // Caption loop: wait 2.5s, show 1.5s, hide 1s, next.
  useEffect(() => {
    if (!animated) return;
    let dead = false;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const loop = async () => {
      if (dead) return;
      setShow(true);
      await wait(1500);
      if (dead) return;
      setShow(false);
      await wait(1000);
      if (dead) return;
      setIdx((i) => (i + 1) % CAPTIONS.length);
      loop();
    };
    const t = setTimeout(loop, 2500);
    return () => {
      dead = true;
      clearTimeout(t);
    };
  }, [animated]);

  const c = CAPTIONS[idx];
  return (
    <div style={{ position: "relative", transform: "rotate(12deg)", display: "inline-flex" }}>
      <div className="pointer-events-none" style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)" }}>
        <AnimatePresence mode="wait">
          {show && (
            <m.span
              key={idx}
              initial={{ y: 6, opacity: 0, scale: 0.4, rotate: c.rotate }}
              animate={{ y: -20, opacity: 1, scale: 1, rotate: c.rotate }}
              exit={{ y: 6, opacity: 0, scale: 0.4, rotate: c.rotate }}
              transition={{ type: "spring", stiffness: 50, damping: 12, mass: 0.6 }}
              className="block select-none whitespace-pre text-center font-mono text-[11px] text-paper"
              style={{ transformOrigin: "center bottom" }}
            >
              {c.text}
            </m.span>
          )}
        </AnimatePresence>
      </div>
      <div className="inline-flex items-center gap-[2.5px] rounded-full border border-paper/30 bg-paper px-3.5 py-2">
        {bars.map((s, i) => (
          <m.div
            key={i}
            animate={{ scaleY: s }}
            transition={{ duration: 0.12 }}
            className="w-[3.5px] origin-center rounded-full bg-ink"
            style={{ height: 24 }}
          />
        ))}
      </div>
    </div>
  );
}

export function HeroRibbon() {
  const reduce = useReduceMotion();
  const measureRef = useRef<SVGPathElement>(null);
  const [pill, setPill] = useState<{ x: number; y: number } | null>(null);

  // Find where the ribbon crosses PILL_X so the pill is pinned to the band itself.
  useEffect(() => {
    const p = measureRef.current;
    if (!p) return;
    const total = p.getTotalLength();
    for (let len = 0; len < total; len += 3) {
      const pt = p.getPointAtLength(len);
      if (pt.x >= PILL_X) {
        setPill({ x: pt.x, y: pt.y + DROP });
        return;
      }
    }
  }, []);

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMinYMid slice"
      className="absolute inset-0 h-full w-full overflow-visible"
    >
      <defs>
        <path id="ribbonPath" d={PATH} pathLength={100} />
      </defs>
      <path ref={measureRef} d={PATH} fill="none" stroke="none" />

      <g transform={`translate(0 ${DROP})`}>
        {/* Three stacked strokes: dark core, light rim, dark core = a 1px bevel. */}
        <g opacity="0.6">
          <use href="#ribbonPath" className="stroke-ink" strokeWidth="24" fill="none" strokeLinecap="round" strokeDasharray="0 19 82 200" />
          <use href="#ribbonPath" stroke="rgb(248 248 248 / 0.18)" strokeWidth="26" fill="none" strokeLinecap="round" strokeDasharray="0 19 82 200" />
          <use href="#ribbonPath" className="stroke-ink" strokeWidth="23" fill="none" strokeLinecap="round" strokeDasharray="0 19 82 200" />
        </g>

        <text className="fill-paper" fontSize="10.5" fontFamily="var(--font-mono)" fontWeight="600" dy="3.5" style={{ letterSpacing: "1.5px" }}>
          <textPath href="#ribbonPath" startOffset={reduce ? "0%" : undefined}>
            {!reduce && <animate attributeName="startOffset" from="-100%" to="0%" dur="150s" repeatCount="indefinite" />}
            {CRAWL}
          </textPath>
        </text>

        {/* Pulse: a bright line that draws itself along the band every 15s. */}
        {!reduce && (
          <use href="#ribbonPath" className="stroke-signal" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeDasharray="100 4000">
            <animate attributeName="stroke-dashoffset" from="2500" to="0" dur="15s" repeatCount="indefinite" />
          </use>
        )}
      </g>

      {pill && (
        <foreignObject className="max-lg:hidden" x={pill.x - 75} y={pill.y - 25} width={150} height={50} style={{ overflow: "visible" }}>
          <ClearingPill animated={!reduce} />
        </foreignObject>
      )}
    </svg>
  );
}
