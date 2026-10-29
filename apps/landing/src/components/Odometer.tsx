"use client";

import { m, useInView } from "motion/react";
import { useRef, type CSSProperties } from "react";
import { useReduceMotion } from "@/lib/stage";

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
/** Height of one digit cell, in em: taller than the 0.85em line so no glyph is clipped. */
const CELL = 1.1;

/**
 * A figure whose digits roll vertically to their value, once, over about 1s
 * when scrolled into view. Each digit is its own fixed-width column of 0 to 9.
 * The value is also in a text label, and the rolling columns are hidden from
 * assistive technology. Under reduced motion the final value renders at once.
 */
export function Odometer({
  value,
  prefix = "$",
  label,
  className = "",
}: {
  value: number;
  prefix?: string;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReduceMotion();
  const roll = seen || reduce;
  const digits = String(value).split("").map(Number);

  return (
    <span ref={ref} className={`t-odo inline-flex ${className}`} role="img" aria-label={label}>
      <span aria-hidden="true">{prefix}</span>
      {digits.map((d, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="relative inline-block"
          style={{
            // One column per digit: 1ch is the width of the display face's "0". Clipped vertically only, so a wide digit is never cut at the side.
            width: "1ch",
            height: `${CELL}em`,
            marginBlock: `${(0.85 - CELL) / 2}em`,
            clipPath: "inset(0 -1em)",
          }}
        >
          <m.span
            className="odo-strip absolute inset-x-0 top-0 flex flex-col"
            style={{ "--final": `${-d * CELL}em` } as CSSProperties}
            initial={false}
            animate={{ y: roll ? `${-d * CELL}em` : "0em" }}
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 0.8, ease: [0.65, 0, 0.35, 1], delay: i * 0.06 }
            }
          >
            {DIGITS.map((n) => (
              <span key={n} className="flex items-center justify-center" style={{ height: `${CELL}em`, lineHeight: CELL }}>
                {n}
              </span>
            ))}
          </m.span>
        </span>
      ))}
    </span>
  );
}
