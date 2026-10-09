"use client";

import { useState, type CSSProperties } from "react";
import { usd } from "@/lib/clearing";

/** Each institution keeps one colour everywhere it appears. */
export const PARTY: Record<string, { bg: string; fg: string; css: string }> = {
  A: { bg: "bg-accent", fg: "text-paper", css: "var(--color-accent)" },
  B: { bg: "bg-signal", fg: "text-ink", css: "var(--color-signal)" },
  C: { bg: "bg-coral", fg: "text-ink", css: "var(--color-coral)" },
};

export type Item = {
  label: string;
  amount: number;
  title: string;
  /** Institutions shown as tiles: [payer] or [payer, payee]. */
  parties: string[];
  sub?: string;
  /** Receivers read in the loud second hue; everything else in paper. */
  receives?: boolean;
  /** Leaves a little extra space before this strip, to mark a new group. */
  startsGroup?: boolean;
};

const SIZES = {
  sm: "h-9 w-9 text-[1.375rem]",
  md: "h-14 w-14 text-[2.25rem] sm:h-16 sm:w-16 sm:text-[2.5rem]",
  lg: "h-24 w-24 text-[3.5rem] sm:h-28 sm:w-28 sm:text-[4rem]",
};

/** An app-icon style tile: rounded squircle, institution colour, Aalto initial, soft glow. */
function Tile({ party, size }: { party: string; size: keyof typeof SIZES }) {
  const c = PARTY[party];
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-[22%] font-display leading-none ${c.bg} ${c.fg} ${SIZES[size]}`}
      style={{ boxShadow: `0 10px 36px color-mix(in srgb, ${c.css} 38%, transparent)` }}
    >
      {party}
    </span>
  );
}

/**
 * A row of strips; hovering, focusing or tapping one opens it. The strips are
 * real buttons, so keyboard and touch work, and each carries its full meaning
 * in its accessible name while the visual layers stay out of the way.
 */
export function Accordion({ items, label }: { items: Item[]; label: string }) {
  const [active, setActive] = useState(0);

  return (
    <ul aria-label={label} className="acc">
      {items.map((it, i) => {
        const on = active === i;
        const lead = PARTY[it.parties[0]];
        return (
          <li
            key={it.title}
            className={`acc-item ${it.startsGroup ? "acc-group" : ""}`}
            data-active={on}
            style={{ "--c": lead.css } as CSSProperties}
          >
            <button
              type="button"
              aria-expanded={on}
              aria-label={`${it.title}, ${usd(it.amount)}${it.sub ? `, ${it.sub}` : ""}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className="acc-btn stage-tab"
            >
              {/* Collapsed: index, sideways title, a small institution tile. */}
              <span aria-hidden="true" className="acc-collapsed">
                <span className="spaced text-paper/70">0{i + 1}</span>
                <span className="acc-vert">{it.title}</span>
                <Tile party={it.parties[0]} size="sm" />
              </span>

              {/* Open: tag, tiles, the amount, the working, the title. */}
              <span aria-hidden="true" className="acc-open">
                <span className="flex items-center justify-between">
                  <span className={`rounded-full px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] ${lead.bg} ${lead.fg}`}>
                    {it.label}
                  </span>
                  <span className="spaced tabular text-paper/60">
                    0{i + 1} / 0{items.length}
                  </span>
                </span>

                <span className="flex flex-1 flex-col items-center justify-center gap-3">
                  {it.parties.length === 2 ? (
                    <span className="flex items-center gap-3">
                      <Tile party={it.parties[0]} size="md" />
                      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-paper/70">
                        <path d="M3 8h10M9 4l4 4-4 4" />
                      </svg>
                      <Tile party={it.parties[1]} size="md" />
                    </span>
                  ) : (
                    <Tile party={it.parties[0]} size="lg" />
                  )}
                  <span className={`font-display text-[3.75rem] leading-none sm:text-[4.5rem] ${it.receives ? "text-signal" : "text-paper"}`}>
                    {usd(it.amount)}
                  </span>
                  {it.sub ? (
                    <span className="tabular font-mono text-[11px] tracking-[0.02em] text-paper/70">{it.sub}</span>
                  ) : null}
                </span>

                <span className="block border-t border-paper/15 pt-4 text-base font-semibold uppercase tracking-widest">
                  {it.title}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
