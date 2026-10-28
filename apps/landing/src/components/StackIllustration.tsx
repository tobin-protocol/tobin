"use client";

import { useInView } from "motion/react";
import { useRef } from "react";

export type Layer = "institutions" | "tobin" | "soroban" | "stellar" | "sep31";

/** One colour per layer, so a row and its picture speak the same language. */
const COLOR: Record<Layer, string> = {
  institutions: "var(--color-paper)",
  tobin: "var(--color-sky)",
  soroban: "var(--color-signal)",
  stellar: "var(--color-accent-bright)",
  sep31: "var(--color-paper)",
};

// Top to bottom. cy is the centre of each slab's top face.
const SLABS = [
  { id: "institutions", label: "Institutions", cy: 96 },
  { id: "tobin", label: "Tobin", cy: 181 },
  { id: "soroban", label: "Soroban", cy: 266 },
  { id: "stellar", label: "Stellar", cy: 351 },
] as const;

const CX = 160; // slab centre x
const W = 116; // half-width of a top face
const H = 58; // half-height of a top face
const T = 20; // slab thickness

const pt = (x: number, y: number) => `${x},${y}`;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function Slab({ cy, lit, color }: { cy: number; lit: boolean; color: string }) {
  const top = [pt(CX, cy - H), pt(CX + W, cy), pt(CX, cy + H), pt(CX - W, cy)].join(" ");
  const left = [pt(CX - W, cy), pt(CX, cy + H), pt(CX, cy + H + T), pt(CX - W, cy + T)].join(" ");
  const right = [pt(CX, cy + H), pt(CX + W, cy), pt(CX + W, cy + T), pt(CX, cy + H + T)].join(" ");

  // Wireframe grid on the top face: three lines each way.
  const lines: [number, number, number, number][] = [];
  for (let k = 1; k <= 3; k++) {
    const f = k / 4;
    // parallel to the left-bottom edge
    lines.push([lerp(CX - W, CX, f), lerp(cy, cy - H, f), lerp(CX, CX + W, f), lerp(cy + H, cy, f)]);
    // parallel to the top-left edge
    lines.push([lerp(CX, CX + W, f), lerp(cy - H, cy, f), lerp(CX - W, CX, f), lerp(cy, cy + H, f)]);
  }

  return (
    <g>
      {/* Wireframe: dark body, thin paper lines. */}
      <g className="fill-ink stroke-paper/55" strokeWidth={1.25} strokeLinejoin="round">
        <polygon points={left} />
        <polygon points={right} />
        <polygon points={top} />
      </g>
      <g className="stroke-paper/20" strokeWidth={1}>
        {lines.map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>

      {/* Lit: the same slab filled in its colour, fading in when it scrolls into view. */}
      <g
        className="transition-opacity duration-[900ms] ease-out motion-reduce:transition-none"
        style={{ opacity: lit ? 1 : 0 }}
      >
        <polygon points={left} style={{ fill: `color-mix(in srgb, ${color} 62%, black)` }} />
        <polygon points={right} style={{ fill: `color-mix(in srgb, ${color} 42%, black)` }} />
        <polygon points={top} style={{ fill: color }} />
      </g>
    </g>
  );
}

/**
 * An isometric wireframe of Tobin's place in the stack, with one layer lit.
 * Decorative: the sentence beside it carries the meaning, and the whole
 * picture has a text equivalent.
 */
export function StackIllustration({ active }: { active: Layer }) {
  const ref = useRef<SVGSVGElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.5 });
  const color = COLOR[active];
  const sepLit = active === "sep31" && seen;

  return (
    <svg
      ref={ref}
      viewBox="0 0 500 440"
      role="img"
      aria-label={`Simplified architecture, top to bottom: institutions and integrators, the Tobin clearing layer, Soroban, and the Stellar network. SEP-31 sits alongside and is complemented by Tobin. Highlighted: ${active === "sep31" ? "SEP-31" : active}.`}
      className="h-auto w-full max-w-[34rem]"
    >
      <g fontFamily="var(--font-mono)">
        {/* Bottom first, so each slab overlaps the one beneath it. */}
        {[...SLABS].reverse().map((s) => (
          <g key={s.id}>
            <Slab cy={s.cy} lit={seen && active === s.id} color={COLOR[s.id]} />
            <line x1={CX + W} y1={s.cy} x2={CX + W + 24} y2={s.cy} className="stroke-paper/40" strokeWidth={1} />
            <text
              x={CX + W + 32}
              y={s.cy + 5}
              fontSize={15}
              fontWeight={active === s.id ? 700 : 500}
              letterSpacing="0.04em"
              className={active === s.id ? "fill-paper" : "fill-paper/70"}
            >
              {s.label}
            </text>
          </g>
        ))}

        {/* SEP-31: a dashed pillar alongside the stack, not part of it. */}
        <rect x={452} y={64} width={32} height={318} rx={16} fill="none" className="stroke-paper/45" strokeWidth={1.25} strokeDasharray="5 5" />
        <g
          className="transition-opacity duration-[900ms] ease-out motion-reduce:transition-none"
          style={{ opacity: sepLit ? 1 : 0 }}
        >
          <rect x={452} y={64} width={32} height={318} rx={16} className="fill-paper" />
        </g>
        <text
          x={468}
          y={223}
          fontSize={14}
          fontWeight={700}
          letterSpacing="0.14em"
          textAnchor="middle"
          transform="rotate(-90 468 223)"
          className={sepLit ? "fill-ink" : "fill-paper/80"}
        >
          SEP-31
        </text>

        {/* "Complements": only drawn for the SEP-31 row. */}
        {active === "sep31" ? (
          <g
            className="transition-opacity duration-[900ms] ease-out motion-reduce:transition-none"
            style={{ opacity: seen ? 1 : 0 }}
          >
            <line x1={448} y1={181} x2={376} y2={181} stroke={color} strokeWidth={1.5} strokeDasharray="4 4" />
            <path d="M376 181 l8 -4.5 v9 z" fill={color} />
            <text x={400} y={168} fontSize={12} textAnchor="middle" className="fill-paper" letterSpacing="0.06em">
              complements
            </text>
          </g>
        ) : null}
      </g>
    </svg>
  );
}
