"use client";

import { useEffect, useId, useRef, useState } from "react";

const SIZE = 120; // font size in SVG units
const BASELINE = 100;
const MID = BASELINE - SIZE * 0.26; // the vertical middle of the lower-case letters
const GAP = 5; // height of each cut, in SVG units

type Cut = { x: number; w: number };

/**
 * A stencil-cut wordmark. The text is live Urbanist (not outlines), and a mask cuts thin
 * horizontal breaks through every "o" (left and right), every "b" bowl and every "n" stem, the
 * way a stencil face breaks its rounds. The breaks are placed from the measured extent of each
 * letter, so they follow the font. Before the font is measured, and without JavaScript, the
 * text shows uncut. It scales to the width of its box. Decorative lettering with an accessible name.
 */
export function StencilWordmark({ text, className = "" }: { text: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  const node = useRef<SVGTextElement>(null);
  const [box, setBox] = useState({ w: text.length * SIZE * 0.6, cuts: [] as Cut[] });

  useEffect(() => {
    const el = node.current;
    if (!el) return;
    const measure = () => {
      const cuts: Cut[] = [];
      [...text].forEach((ch, i) => {
        if (ch !== "o" && ch !== "b" && ch !== "n") return;
        const e = el.getExtentOfChar(i);
        if (ch === "o") {
          cuts.push({ x: e.x - 2, w: e.width * 0.3 + 2 }); // left
          cuts.push({ x: e.x + e.width * 0.7, w: e.width * 0.3 + 2 }); // right
        } else {
          cuts.push({ x: e.x + e.width * 0.62, w: e.width * 0.4 }); // right bowl or stem
        }
      });
      setBox({ w: Math.ceil(el.getBBox().width) + 8, cuts });
    };
    let alive = true;
    document.fonts.ready.then(() => alive && measure());
    return () => {
      alive = false;
    };
  }, [text]);

  return (
    <svg
      role="img"
      aria-label={text}
      viewBox={`0 0 ${box.w} 108`}
      className={`block h-auto overflow-visible ${className}`}
    >
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x={-20} y={-20} width={box.w + 40} height={200}>
          <rect x={-20} y={-20} width={box.w + 40} height={200} fill="white" />
          {box.cuts.map((c, i) => (
            <rect key={i} x={c.x} y={MID - GAP / 2} width={c.w} height={GAP} fill="black" />
          ))}
        </mask>
      </defs>
      <text
        ref={node}
        x={2}
        y={BASELINE}
        fill="currentColor"
        mask={`url(#${id})`}
        aria-hidden="true"
        style={{ fontFamily: "var(--font-heading)", fontSize: SIZE, fontWeight: 700, letterSpacing: "-0.01em" }}
      >
        {text}
      </text>
    </svg>
  );
}
