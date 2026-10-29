"use client";

import { m, useTransform } from "motion/react";
import { foldProgress } from "@/lib/fold";
import { statusLine } from "@/lib/site";
import { useCompact, usePinned } from "@/lib/stage";
import { Arrow } from "./ui";

/**
 * The honest status line: at least 48px, over the top of the hero, white Geist 14/500.
 * Pinned, it slides up and away as the hero folds (the fold progress 0 to 0.3); in the
 * static layout it scrolls away with the page and the fixed nav follows it up. Below 1024px it
 * is one horizontal row like Ondo's: the text on the left (12px, wrapping to two lines), the link
 * on the right. It is transparent: the hero's top band keeps it legible.
 */
export function StatusBar() {
  const pinned = usePinned();
  const compact = useCompact();
  const folds = pinned || compact;
  const y = useTransform(foldProgress, (v) => `${-Math.min(1, v / 0.3) * 100}%`);
  const opacity = useTransform(foldProgress, (v) => 1 - Math.min(1, v / 0.3));
  return (
    <m.div
      id="status-bar"
      role="region"
      aria-label="Project status"
      data-surface="dark"
      className="absolute inset-x-0 top-0 z-30 text-paper"
      style={folds ? { y, opacity } : undefined}
    >
      <p className="mx-auto flex min-h-12 max-w-[94.5rem] items-center justify-between gap-4 px-[22px] py-1 text-left text-xs font-medium leading-[1.3] md:px-[44px] lg:justify-center lg:text-center lg:text-[0.875rem]">
        <span>{statusLine}</span>
        <a href="#status" className="link inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap">
          Learn more
          <Arrow />
        </a>
      </p>
    </m.div>
  );
}
