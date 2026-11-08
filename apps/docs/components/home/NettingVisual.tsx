"use client";

import { useEffect, useRef, useState } from "react";

/*
 * The idea behind Tobin in one picture. Three institutions owe each other in a cycle (A owes B 100, B owes C 80,
 * C owes A 70). Settled one by one that moves 250. Netted, A pays 20 to B and 10 to C: 30 moves. The numbers are
 * the arithmetic example from the documentation, not data. Net = outgoing - incoming; positive means debtor.
 */

type Mode = "gross" | "net";
type Pt = { x: number; y: number };

const R = 30; // node radius
const NODES: Record<"A" | "B" | "C", Pt> = {
  A: { x: 240, y: 70 },
  B: { x: 84, y: 282 },
  C: { x: 396, y: 282 },
};

function edge(from: Pt, to: Pt, bend: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const s = { x: from.x + ux * (R + 6), y: from.y + uy * (R + 6) };
  const e = { x: to.x - ux * (R + 12), y: to.y - uy * (R + 12) };
  const c = { x: (s.x + e.x) / 2 - uy * bend, y: (s.y + e.y) / 2 + ux * bend };
  return {
    d: `M${s.x} ${s.y} Q${c.x} ${c.y} ${e.x} ${e.y}`,
    label: { x: 0.25 * s.x + 0.5 * c.x + 0.25 * e.x, y: 0.25 * s.y + 0.5 * c.y + 0.25 * e.y },
  };
}

const GROSS = [
  { id: "ab", from: "A", to: "B", amount: 100, ...edge(NODES.A, NODES.B, 26) },
  { id: "bc", from: "B", to: "C", amount: 80, ...edge(NODES.B, NODES.C, 26) },
  { id: "ca", from: "C", to: "A", amount: 70, ...edge(NODES.C, NODES.A, 26) },
] as const;

const NET = [
  { id: "nab", from: "A", to: "B", amount: 20, ...edge(NODES.A, NODES.B, 0) },
  { id: "nac", from: "A", to: "C", amount: 10, ...edge(NODES.A, NODES.C, 0) },
] as const;

const CAPTION: Record<"A" | "B" | "C", Record<Mode, string>> = {
  A: { gross: "out 100 · in 70", net: "pays 30" },
  B: { gross: "out 80 · in 100", net: "receives 20" },
  C: { gross: "out 70 · in 80", net: "receives 10" },
};

function useCount(target: number, reduced: boolean) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduced) {
      setV(target);
      from.current = target;
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 900);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = Math.round(start + (target - start) * eased);
      setV(val);
      from.current = val;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced]);
  return v;
}

export function NettingVisual() {
  const [mode, setMode] = useState<Mode>("gross");
  const [auto, setAuto] = useState(true);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (!auto || reduced) return;
    const id = setInterval(() => setMode((m) => (m === "gross" ? "net" : "gross")), 4800);
    return () => clearInterval(id);
  }, [auto, reduced]);

  const moved = useCount(mode === "gross" ? 250 : 30, reduced);
  const choose = (m: Mode) => {
    setAuto(false);
    setMode(m);
  };
  const isNet = mode === "net";

  return (
    <figure
      className="relative overflow-hidden rounded-[24px] border border-fd-border bg-fd-card p-4 sm:p-6"
      aria-label="Illustration: three institutions settle gross, then netted"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Settlement view"
          className="inline-flex rounded-[10px] border border-fd-border bg-fd-background p-1"
        >
          {(["gross", "net"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => choose(m)}
              className={`min-h-9 rounded-[7px] px-4 text-sm font-medium transition-colors ${
                mode === m
                  ? "bg-fd-primary text-fd-primary-foreground"
                  : "text-fd-muted-foreground hover:text-fd-foreground"
              }`}
            >
              {m === "gross" ? "One by one" : "Netted"}
            </button>
          ))}
        </div>
        <p className="font-label text-xs uppercase tracking-[0.08em] text-fd-muted-foreground">Arithmetic example</p>
      </div>

      <svg viewBox="0 0 480 350" className="mt-2 h-auto w-full" role="img" aria-labelledby="nv-title nv-desc">
        <title id="nv-title">Netting three obligations</title>
        <desc id="nv-desc">
          A owes B 100, B owes C 80 and C owes A 70. Settled one by one, 250 moves. Netted, A pays B 20 and C 10, so 30
          moves.
        </desc>
        <defs>
          <marker id="nv-arrow-gross" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" style={{ fill: "var(--color-fd-muted-foreground)" }} />
          </marker>
          <marker id="nv-arrow-net" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" style={{ fill: "var(--color-fd-success)" }} />
          </marker>
        </defs>

        <g style={{ opacity: isNet ? 0 : 1, transition: reduced ? "none" : "opacity 700ms var(--ease-ui, ease)" }}>
          {GROSS.map((e) => (
            <g key={e.id}>
              <path
                d={e.d}
                pathLength={1}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                markerEnd="url(#nv-arrow-gross)"
                style={{
                  stroke: "var(--color-fd-muted-foreground)",
                  strokeDasharray: 1,
                  strokeDashoffset: isNet ? 1 : 0,
                  transition: reduced ? "none" : "stroke-dashoffset 900ms var(--ease-ui, ease)",
                }}
              />
              <AmountChip x={e.label.x} y={e.label.y} text={String(e.amount)} />
            </g>
          ))}
        </g>

        <g style={{ opacity: isNet ? 1 : 0, transition: reduced ? "none" : "opacity 700ms var(--ease-ui, ease)" }}>
          {NET.map((e) => (
            <g key={e.id}>
              <path
                d={e.d}
                pathLength={1}
                fill="none"
                strokeWidth={3}
                strokeLinecap="round"
                markerEnd="url(#nv-arrow-net)"
                style={{
                  stroke: "var(--color-fd-success)",
                  strokeDasharray: 1,
                  strokeDashoffset: isNet ? 0 : 1,
                  transition: reduced ? "none" : "stroke-dashoffset 900ms var(--ease-ui, ease)",
                }}
              />
              <AmountChip x={e.label.x} y={e.label.y} text={String(e.amount)} accent />
            </g>
          ))}
        </g>

        {(Object.keys(NODES) as ("A" | "B" | "C")[]).map((k) => {
          const p = NODES[k];
          const creditor = isNet && k !== "A";
          return (
            <g key={k}>
              <circle
                cx={p.x}
                cy={p.y}
                r={R}
                strokeWidth={2}
                style={{
                  fill: "var(--color-fd-background)",
                  stroke: creditor ? "var(--color-fd-success)" : "var(--color-fd-foreground)",
                  transition: reduced ? "none" : "stroke 700ms ease",
                }}
              />
              <text
                x={p.x}
                y={p.y + 7}
                textAnchor="middle"
                fontSize={22}
                fontWeight={500}
                style={{ fill: "var(--color-fd-foreground)", fontFamily: "var(--font-heading)" }}
              >
                {k}
              </text>
              <text
                x={p.x}
                y={p.y + (k === "A" ? -(R + 12) : R + 22)}
                textAnchor="middle"
                fontSize={12}
                style={{ fill: "var(--color-fd-muted-foreground)", fontFamily: "var(--font-label)" }}
              >
                {CAPTION[k][mode]}
              </text>
            </g>
          );
        })}
      </svg>

      <figcaption className="mt-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-t border-fd-border pt-4">
        <div>
          <p className="font-label text-xs uppercase tracking-[0.08em] text-fd-muted-foreground">Value settled</p>
          <p
            className="font-display text-5xl font-medium leading-none tracking-[-0.03em] tabular-nums transition-colors"
            style={{ color: isNet ? "var(--color-fd-success)" : "var(--color-fd-foreground)" }}
          >
            {moved}
          </p>
        </div>
        <p className="max-w-[17rem] text-sm text-fd-muted-foreground">
          {isNet
            ? "Net positions always sum to zero. Only the net amounts are settled."
            : "Each obligation is settled on its own, though most of them offset."}
        </p>
      </figcaption>
      <p className="sr-only" aria-live="polite">
        {isNet ? "Netted view: 30 moves." : "One by one view: 250 moves."}
      </p>
    </figure>
  );
}

function AmountChip({ x, y, text, accent = false }: { x: number; y: number; text: string; accent?: boolean }) {
  const w = 12 + text.length * 9;
  return (
    <g>
      <rect
        x={x - w / 2}
        y={y - 12}
        width={w}
        height={24}
        rx={12}
        style={{
          fill: "var(--color-fd-background)",
          stroke: accent ? "var(--color-fd-success)" : "var(--color-fd-border)",
        }}
      />
      <text
        x={x}
        y={y + 4.5}
        textAnchor="middle"
        fontSize={13}
        fontWeight={500}
        style={{ fill: "var(--color-fd-foreground)", fontFamily: "var(--font-label)" }}
      >
        {text}
      </text>
    </g>
  );
}
