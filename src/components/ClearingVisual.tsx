"use client";

import { m, useInView, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EXAMPLE, EXAMPLE_OBLIGATIONS, usd } from "@/lib/clearing";

export type Stage = 0 | 1 | 2 | 3;

export const STAGES: { label: string; caption: string }[] = [
  {
    label: "Obligations",
    caption: `Three institutions owe each other money. Settled one by one, ${usd(EXAMPLE.gross)} would move.`,
  },
  {
    label: "Clearing",
    caption: "Eligible obligations are brought together into a single clearing session.",
  },
  {
    label: "Netting",
    caption: "Offsetting amounts cancel. Each institution ends with one net position.",
  },
  {
    label: "Settlement",
    caption: `Only the net positions settle on Stellar: ${usd(EXAMPLE.settled)} moves instead of ${usd(EXAMPLE.gross)}.`,
  },
];

/* ---- Geometry (viewBox units) ------------------------------------------ */

const W = 360;
const H = 444;
const R = 26; // node radius
const NODES: Record<string, { x: number; y: number }> = {
  A: { x: 64, y: 76 },
  B: { x: 296, y: 76 },
  C: { x: 180, y: 236 },
};
const HUB = { x: 180, y: 129 };
const HUB_R = 38;
const BAR = { x: 8, y: 350, w: 344, h: 72 };
// Tokens settle on the hub's ring, clear of its label.
const TOKEN_OFFSET = [
  { x: -HUB_R * Math.cos(Math.PI / 6), y: -HUB_R * Math.sin(Math.PI / 6) },
  { x: HUB_R * Math.cos(Math.PI / 6), y: -HUB_R * Math.sin(Math.PI / 6) },
  { x: 0, y: HUB_R },
];

/** A straight edge between two nodes, padded off the circles, with a label spot. */
function edge(from: string, to: string) {
  const a = NODES[from];
  const b = NODES[to];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const pad = R + 6;
  const start = { x: a.x + ux * pad, y: a.y + uy * pad };
  const end = { x: b.x - ux * pad, y: b.y - uy * pad };
  // Label sits on the side facing away from the hub so it never crosses it.
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  let nx = -uy;
  let ny = ux;
  if (nx * (mid.x - HUB.x) + ny * (mid.y - HUB.y) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return {
    start,
    lineEnd: { x: end.x - ux * 7, y: end.y - uy * 7 },
    end,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    label: { x: mid.x + nx * 15, y: mid.y + ny * 15 },
  };
}

const EDGES = EXAMPLE_OBLIGATIONS.map((o) => ({ ...o, ...edge(o.from, o.to) }));

const HEAD = "M0 0 L-9 -4.5 L-9 4.5 Z";

/** Where each net position settles against the bar. */
const SETTLE = EXAMPLE.positions.map((p) => {
  const n = NODES[p.party];
  const pays = p.net < 0;
  // C's badge sits under its node, so its arrow ends at the badge instead.
  const top = p.party === "C" ? n.y + R + 22 + 12 + 6 : n.y + R + 6;
  const bottom = BAR.y - 6;
  return {
    ...p,
    pays,
    x: n.x,
    // Payers flow down into the bar; receivers flow up out of it.
    from: pays ? top : bottom,
    to: pays ? bottom : top,
    labelY: p.party === "C" ? 326 : 232,
    amount: Math.abs(p.net),
  };
});

const BADGES = EXAMPLE.positions.map((p) => {
  const n = NODES[p.party];
  const pays = p.net < 0;
  const w = pays ? 78 : 106;
  const aboveNode = p.party !== "C";
  const cx = n.x;
  const cy = aboveNode ? n.y - R - 22 : n.y + R + 22;
  return { party: p.party, pays, w, cx, cy, text: `${pays ? "Pays" : "Receives"} ${usd(Math.abs(p.net))}` };
});

const ARIA_LABEL = `Diagram of an illustrative example. ${EXAMPLE_OBLIGATIONS.map(
  (o) => `${o.from} owes ${o.to} ${usd(o.amount)}`,
).join(", ")}. Tobin clears these into one session and nets them: ${EXAMPLE.positions
  .map((p) => `${p.party} ${p.net < 0 ? "pays" : "receives"} ${usd(Math.abs(p.net))}`)
  .join(", ")}. Only those net positions settle on Stellar.`;

/* ---- Component ----------------------------------------------------------- */

const STEP_MS = [1500, 1900, 1900];

/**
 * Uncontrolled by default: plays through once, with stage buttons and Replay.
 * Pass `stage` to drive it from outside (a scroll scene); controls and
 * autoplay are then off and the caller owns the pacing.
 */
export function ClearingVisual({
  fit = false,
  stage: controlled,
}: {
  fit?: boolean;
  stage?: Stage;
}) {
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.55 });
  const [own, setStage] = useState<Stage>(0);
  const isControlled = controlled !== undefined;
  const stage = isControlled ? controlled : own;
  const timer = useRef<number | undefined>(undefined);

  const stop = useCallback(() => window.clearTimeout(timer.current), []);

  // Walk forward from `from`, one timeout per step. Any manual choice calls stop().
  const schedule = useCallback(
    (from: Stage) => {
      stop();
      const step = (s: Stage) => {
        if (s >= 3) return;
        timer.current = window.setTimeout(() => {
          const next = (s + 1) as Stage;
          setStage(next);
          step(next);
        }, STEP_MS[s]);
      };
      step(from);
    },
    [stop],
  );

  // Play through once when the visual first scrolls into view. Never loops,
  // and never starts on its own for people who prefer reduced motion.
  useEffect(() => {
    if (inView && !reduce && !isControlled) schedule(0);
    return stop;
  }, [inView, reduce, isControlled, schedule, stop]);

  const choose = (s: Stage) => {
    stop();
    setStage(s);
  };
  const replay = () => {
    setStage(0);
    schedule(0);
  };

  // Springs are critically damped; reduced motion collapses to short fades.
  const move = reduce
    ? { duration: 0.2 }
    : { type: "spring" as const, bounce: 0, duration: 0.7 };
  const fade = { duration: reduce ? 0.2 : 0.45, ease: [0.2, 0.8, 0.2, 1] as const };

  const grossOpacity = stage === 0 ? 1 : stage === 1 ? 0.28 : 0.1;

  return (
    <div
      ref={rootRef}
      className="border border-line bg-surface p-4 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-accent-tint px-3 py-1.5 text-xs font-semibold tracking-[0.01em] text-accent-ink">
          Illustrative example
        </span>
        {isControlled ? (
          <span className="tabular font-mono text-xs tracking-[0.12em] text-ink-soft">
            0{stage + 1} / 04
          </span>
        ) : (
          <button
            type="button"
            onClick={replay}
            className="stage-tab inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-medium text-ink-soft transition-colors hover:text-ink"
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 8a5.5 5.5 0 1 0 1.9-4.15M2.5 2.5v3h3" />
            </svg>
            Replay
          </button>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={`mt-1 block h-auto w-full ${fit ? "pin-fit" : ""}`}
        role="img"
        aria-label={ARIA_LABEL}
      >
        <g aria-hidden="true" fontFamily="var(--font-sans)">
          {/* Settlement layer: the destination, present from the start. */}
          <m.g animate={{ opacity: stage === 3 ? 1 : 0.6 }} transition={fade}>
            <rect x={BAR.x} y={BAR.y} width={BAR.w} height={BAR.h} rx={18} className="fill-paper stroke-line-strong" strokeWidth={1} />
            <m.rect
              x={BAR.x}
              y={BAR.y}
              width={BAR.w}
              height={BAR.h}
              rx={18}
              className="fill-none stroke-accent"
              strokeWidth={1.5}
              animate={{ opacity: stage === 3 ? 1 : 0 }}
              transition={fade}
            />
            <text x={BAR.x + 18} y={BAR.y + 29} className="fill-ink-soft" fontSize={11.5} fontWeight={600} letterSpacing="0.08em">
              SETTLEMENT LAYER
            </text>
            <text x={BAR.x + 18} y={BAR.y + 52} className="fill-ink" fontSize={16} fontWeight={600} letterSpacing="-0.01em">
              Soroban on Stellar
            </text>
            <m.text
              x={BAR.x + BAR.w - 18}
              y={BAR.y + 52}
              textAnchor="end"
              className="fill-accent-ink"
              fontSize={12.5}
              fontWeight={600}
              animate={{ opacity: stage === 3 ? 1 : 0 }}
              transition={fade}
            >
              Net positions only
            </m.text>
          </m.g>

          {/* Gross obligations. */}
          {EDGES.map((e) => (
            <g key={`${e.from}${e.to}`}>
              <m.g animate={{ opacity: grossOpacity }} transition={fade}>
                <line x1={e.start.x} y1={e.start.y} x2={e.lineEnd.x} y2={e.lineEnd.y} className="stroke-ink" strokeWidth={1.75} strokeLinecap="round" />
                <path d={HEAD} transform={`translate(${e.end.x} ${e.end.y}) rotate(${e.angle})`} className="fill-ink" />
              </m.g>
              <m.text
                x={e.label.x}
                y={e.label.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-ink tabular"
                fontSize={14}
                fontWeight={600}
                animate={{ opacity: stage === 0 ? 1 : stage === 1 ? 0.45 : 0 }}
                transition={fade}
              >
                {usd(e.amount)}
              </m.text>
            </g>
          ))}

          {/* Clearing session hub. */}
          <m.g
            animate={{ opacity: stage === 0 ? 0 : stage === 3 ? 0.5 : 1, scale: stage === 0 ? 0.85 : 1 }}
            transition={move}
          >
            <circle cx={HUB.x} cy={HUB.y} r={HUB_R} className="fill-accent-tint stroke-accent" strokeWidth={1.5} />
            <text x={HUB.x} y={HUB.y - 2} textAnchor="middle" className="fill-accent-ink" fontSize={13} fontWeight={650}>
              Clearing
            </text>
            <text x={HUB.x} y={HUB.y + 14} textAnchor="middle" className="fill-accent-ink" fontSize={11.5} fontWeight={500}>
              session
            </text>
          </m.g>

          {/* Obligations travelling into the session. */}
          {EDGES.map((e, i) => {
            const from = NODES[e.from];
            const t = TOKEN_OFFSET[i];
            return (
              <m.circle
                key={`tok-${e.from}`}
                r={5}
                className="fill-accent"
                initial={false}
                animate={{
                  cx: stage >= 1 ? HUB.x + t.x : from.x,
                  cy: stage >= 1 ? HUB.y + t.y : from.y,
                  opacity: stage === 1 ? 1 : 0,
                }}
                transition={{ ...move, opacity: fade, delay: reduce ? 0 : i * 0.06 }}
              />
            );
          })}

          {/* Institutions. */}
          {EXAMPLE.positions.map((p) => {
            const n = NODES[p.party];
            return (
              <g key={p.party}>
                <circle cx={n.x} cy={n.y} r={R} className="fill-surface stroke-ink" strokeWidth={1.75} />
                <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central" className="fill-ink" fontSize={19} fontWeight={650}>
                  {p.party}
                </text>
              </g>
            );
          })}

          {/* Net positions. */}
          {BADGES.map((b) => (
            <m.g
              key={b.party}
              animate={{ opacity: stage >= 2 ? 1 : 0, y: stage >= 2 ? 0 : 6 }}
              transition={move}
            >
              <rect x={b.cx - b.w / 2} y={b.cy - 12} width={b.w} height={24} rx={12} className={b.pays ? "fill-ink" : "fill-accent"} />
              <text x={b.cx} y={b.cy} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={12.5} fontWeight={600} className="tabular">
                {b.text}
              </text>
            </m.g>
          ))}

          {/* Settlement flows between each institution and the settlement layer. */}
          {SETTLE.map((s) => {
            const dir = s.to > s.from ? 1 : -1;
            const lineEndY = s.to - dir * 7;
            return (
              <g key={`settle-${s.party}`}>
                <m.line
                  x1={s.x}
                  y1={s.from}
                  x2={s.x}
                  y2={lineEndY}
                  className={s.pays ? "stroke-ink" : "stroke-accent"}
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  initial={false}
                  animate={{ pathLength: stage === 3 ? 1 : 0, opacity: stage === 3 ? 1 : 0 }}
                  transition={reduce ? { duration: 0.2 } : { ...move, duration: 0.8 }}
                />
                <m.path
                  d={HEAD}
                  transform={`translate(${s.x} ${s.to}) rotate(${dir === 1 ? 90 : -90})`}
                  className={s.pays ? "fill-ink" : "fill-accent"}
                  initial={false}
                  animate={{ opacity: stage === 3 ? 1 : 0 }}
                  transition={{ ...fade, delay: stage === 3 && !reduce ? 0.35 : 0 }}
                />
                <m.text
                  x={s.x + 9}
                  y={s.labelY}
                  className={`tabular ${s.pays ? "fill-ink" : "fill-accent-ink"}`}
                  dominantBaseline="central"
                  fontSize={13.5}
                  fontWeight={650}
                  initial={false}
                  animate={{ opacity: stage === 3 ? 1 : 0 }}
                  transition={fade}
                >
                  {usd(s.amount)}
                </m.text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="grid min-h-[3.25rem] px-1">
        {STAGES.map((s, i) => (
          <p
            key={s.label}
            aria-hidden={stage !== i}
            className={`col-start-1 row-start-1 text-[0.9375rem] leading-snug text-ink transition-opacity duration-300 ${stage === i ? "opacity-100" : "opacity-0"}`}
          >
            {s.caption}
          </p>
        ))}
      </div>

      {isControlled ? (
        // Scroll owns the pacing: show progress only, nothing to press.
        <div aria-hidden="true" className="mt-4 grid grid-cols-4 gap-1.5">
          {STAGES.map((s, i) => (
            <div key={s.label} className="pt-1 text-center">
              <span className={`block h-[3px] w-full rounded-full transition-colors duration-300 ${i <= stage ? "bg-accent" : "bg-line-strong"}`} />
              <span className={`mt-2 block text-[0.75rem] font-semibold sm:text-[0.8125rem] ${stage === i ? "text-ink" : "text-ink-soft"}`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      ) : (
      <div role="group" aria-label="Clearing stages" className="mt-4 grid grid-cols-4 gap-1.5">
        {STAGES.map((s, i) => (
          <button
            key={s.label}
            type="button"
            aria-pressed={stage === i}
            onClick={() => choose(i as Stage)}
            className="stage-tab group rounded-lg pt-1 text-center"
          >
            <span
              className={`block h-[3px] w-full rounded-full transition-colors duration-300 ${i <= stage ? "bg-accent" : "bg-line-strong group-hover:bg-ink-faint"}`}
            />
            <span
              className={`mt-2 block text-[0.75rem] font-semibold tracking-[0.005em] transition-colors sm:text-[0.8125rem] ${stage === i ? "text-ink" : "text-ink-soft group-hover:text-ink"}`}
            >
              {s.label}
            </span>
          </button>
        ))}
      </div>
      )}
    </div>
  );
}
