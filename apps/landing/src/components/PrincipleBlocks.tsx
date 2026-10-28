"use client";

import { m } from "motion/react";
import type { CSSProperties } from "react";
import { useReduceMotion } from "@/lib/stage";

type Block = {
  title: string;
  body: string;
  /** Surface (drives text and focus colours via data-surface), background and ink classes. */
  surface: "accent" | "dark" | "signal";
  className: string;
  /** Colour of the outlined numeral. */
  fg: string;
};

/**
 * Three full-bleed blocks. On scroll they wipe in one after another (the
 * spec's strong in-out curve) with their contents rising behind the wipe; on
 * hover a block widens and its outlined numeral fills with colour. Under
 * reduced motion they appear at once.
 *
 * The scroll trigger watches the unclipped list item; the clip-path lives on
 * its child. (A fully clipped element is never reported as in view, so it
 * could never reveal itself.)
 */
export function PrincipleBlocks({ blocks }: { blocks: Block[] }) {
  const reduce = useReduceMotion();

  return (
    <ol className="pr-row mt-14 md:mt-20">
      {blocks.map((b, i) => {
        const delay = reduce ? 0 : i * 0.14;
        return (
          <m.li
            key={b.title}
            data-surface={b.surface}
            className="pr-item group relative"
            style={{ "--fg": b.fg } as CSSProperties}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
          >
            <m.div
              className={`h-full overflow-hidden ${b.className}`}
              variants={{
                hidden: { clipPath: "inset(100% 0 0 0)" },
                visible: {
                  clipPath: "inset(0% 0 0 0)",
                  transition: { duration: reduce ? 0 : 0.9, ease: [0.76, 0, 0.24, 1], delay },
                },
              }}
            >
              <m.div
                className="flex min-h-[26rem] flex-col justify-between p-6 sm:p-10 md:min-h-[36rem] md:min-w-[min(19rem,33.333vw)] lg:min-h-[40rem]"
                variants={{
                  hidden: { opacity: 0, y: 28 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: { duration: reduce ? 0 : 0.7, ease: [0.25, 1, 0.5, 1], delay: reduce ? 0 : delay + 0.45 },
                  },
                }}
              >
                {/* Outlined numeral: hollow at rest, filled on hover. */}
                <span
                  aria-hidden="true"
                  className="font-display text-[clamp(6rem,10vw,9rem)] leading-[0.8] text-transparent transition-colors duration-500 [-webkit-text-stroke:2px_var(--fg)] group-hover:text-(--fg)"
                >
                  0{i + 1}
                </span>

                <p className="text-body my-10 max-w-[22rem] text-[0.9375rem] sm:text-base">{b.body}</p>

                <h3 className="font-display text-[min(calc((100vw-3rem)/7.9),3.5rem)] uppercase leading-[0.95] sm:text-[min(calc((100vw-5rem)/7.9),4rem)] md:text-[clamp(1rem,calc((33.333vw-5rem)/7.9),3.5rem)]">
                  {b.title.split(" ").map((word) => (
                    <span key={word} className="block">
                      {word}
                    </span>
                  ))}
                </h3>
              </m.div>
            </m.div>
          </m.li>
        );
      })}
    </ol>
  );
}
