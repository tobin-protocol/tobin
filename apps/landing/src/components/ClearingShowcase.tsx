"use client";

import dynamic from "next/dynamic";
import {
  AnimatePresence,
  animate,
  m,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EXAMPLE, usd } from "@/lib/clearing";
import { scrollToY } from "@/lib/lenis";
import { repoLinks } from "@/lib/site";
import { useReduceMotion, usePinned } from "@/lib/stage";
import { Odometer } from "./Odometer";
import { ButtonLink, Icon } from "./ui";
import type { IconSvgElement } from "@hugeicons/react";
import { ListViewIcon, Tick02Icon, UserGroupIcon } from "@hugeicons/core-free-icons";

// The charts (Recharts, in the manner of shadcn/ui's chart component) are loaded on the
// client only, and only once the showcase is near the viewport, so they stay out of the
// first load.
const ShowcaseCharts = dynamic(() => import("./ShowcaseCharts"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

function ChartSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-3 lg:h-full lg:grid-cols-2 lg:grid-rows-[1.25fr_1fr]">
      <div className="min-h-72 rounded-card bg-paper lg:col-span-2" />
      <div className="min-h-64 rounded-card bg-paper" />
      <div className="min-h-64 rounded-card bg-paper" />
    </div>
  );
}

/** Where the pinned showcase sticks, in px from the top of the viewport (below the nav pill). */
const TOP = 80;
/** How much of the scroll between two cards is spent cross-fading them (in card units). */
const BLEND = 0.14;

type Item = {
  title: string;
  value: number;
  prefix: string;
  aria: string;
  body: string;
  icon: IconSvgElement;
};

/** The three rows on the left. Every figure comes from lib/clearing.ts; the sentences are the README's. */
const ITEMS: Item[] = [
  {
    title: "Settled one by one",
    value: EXAMPLE.gross,
    prefix: "$",
    aria: `${usd(EXAMPLE.gross)} when each obligation is settled one by one`,
    body: "Each of the three obligations settles on its own, so the full gross value moves. Settling each one on its own can move substantially more gross value than the final net positions require.",
    icon: ListViewIcon,
  },
  {
    title: "Settled after clearing",
    value: EXAMPLE.settled,
    prefix: "$",
    aria: `${usd(EXAMPLE.settled)} settled after clearing`,
    body: "Cleared first, the net positions are A pays $30, B receives $20, C receives $10, so only $30 is settled.",
    icon: Tick02Icon,
  },
  {
    title: "Participants in the example",
    value: EXAMPLE.positions.length,
    prefix: "",
    aria: `${EXAMPLE.positions.length} participants in the example`,
    body: "Net positions always sum to zero; a session that breaks that rule must not finalize.",
    icon: UserGroupIcon,
  },
];

/** How open card i is (0 closed, 1 open) at progress p (0..1 over the three cards), eased. */
function openness(p: number, i: number) {
  const d = Math.abs(p * ITEMS.length - (i + 0.5));
  const t = Math.min(1, Math.max(0, (0.5 + BLEND - d) / (2 * BLEND)));
  return t * t * (3 - 2 * t);
}

/**
 * One left-hand card. Its height, the fade of its title row and the fade/rise of its body all
 * follow `smooth` continuously, so the stack flows from one card to the next instead of
 * switching. The body has a fixed height (its open height) and is only revealed by the card.
 */
function Row({
  item,
  index,
  smooth,
  active,
  onChoose,
}: {
  item: Item;
  index: number;
  smooth: MotionValue<number>;
  active: boolean;
  onChoose: () => void;
}) {
  const open = useTransform(smooth, (p) => openness(p, index));
  const titleOpacity = useTransform(open, [0, 0.6], [1, 0]);
  const bodyOpacity = useTransform(open, [0.35, 1], [0, 1]);
  const bodyY = useTransform(open, [0, 1], [28, 0]);
  // Fully faded text is also hidden (not merely transparent), so it is never read, focused or measured as text.
  const titleVisibility = useTransform(open, (o) => (o > 0.97 ? "hidden" : "visible"));
  const bodyVisibility = useTransform(open, (o) => (o < 0.03 ? "hidden" : "visible"));
  return (
    <m.article className="relative min-h-0 overflow-hidden rounded-card bg-paper">
      <m.button
        type="button"
        onClick={onChoose}
        tabIndex={active ? -1 : 0}
        aria-expanded={active}
        style={{ opacity: titleOpacity, visibility: titleVisibility }}
        className="t-h5 absolute inset-x-0 top-0 flex h-[4.5rem] items-center justify-between px-6 text-left"
      >
        {item.title}
        <span aria-hidden="true" className="text-grey-600">
          +
        </span>
      </m.button>
      <m.div
        style={{ opacity: bodyOpacity, y: bodyY, visibility: bodyVisibility, height: "var(--body-h)" }}
        className="absolute inset-x-0 top-0 flex flex-col justify-between gap-4 p-5 lg:p-6"
        inert={!active}
      >
        <div className="flex items-start justify-between gap-4">
          <span className="tile">
            <Icon icon={item.icon} />
          </span>
          <span className="badge">Illustrative</span>
        </div>
        <div>
          <h3 className="t-label text-grey-600">{item.title}</h3>
          <Odometer
            value={active ? item.value : 0}
            prefix={item.prefix}
            label={item.aria}
            className="mt-2 [font-size:clamp(4rem,7.5vw,7rem)]"
          />
          <p className="t-serif mt-4 max-w-[34rem] text-base text-grey-850">{item.body}</p>
          <div className="mt-5 flex items-center justify-between gap-4">
            <span aria-hidden="true" className="t-label tracking-[0.2em] text-grey-600">
              {EXAMPLE.positions.map((p) => p.party).join("   ")}
            </span>
            <ButtonLink href={repoLinks.readme}>Read the README</ButtonLink>
          </div>
        </div>
      </m.div>
    </m.article>
  );
}

/**
 * One group of the phone layout (Ondo's mobile products): a white detail card, then that
 * card's charts stacked under it, all inside the grey shell. Every group repeats, so the three
 * states are read one after another instead of switched.
 */
function MobileGroup({ item, index, near }: { item: Item; index: 0 | 1 | 2; near: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <article className="flex flex-col gap-5 rounded-card bg-paper p-5">
        <div className="flex items-start justify-between gap-4">
          <span className="tile">
            <Icon icon={item.icon} />
          </span>
          <span className="badge">Illustrative</span>
        </div>
        <div>
          <h3 className="t-h5">{item.title}</h3>
          <Odometer value={item.value} prefix={item.prefix} label={item.aria} className="mt-3 [font-size:clamp(3.5rem,18vw,5rem)]" />
          <p className="t-serif mt-4 text-base text-grey-850">{item.body}</p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span aria-hidden="true" className="t-label tracking-[0.2em] text-grey-600">
            {EXAMPLE.positions.map((p) => p.party).join("   ")}
          </span>
          <ButtonLink href={repoLinks.readme}>Read the README</ButtonLink>
        </div>
      </article>
      {near ? <ShowcaseCharts active={index} compact /> : <ChartSkeleton />}
    </div>
  );
}

/**
 * The problem as a product showcase, in the way Ondo lays out its products: a grey shell
 * whose left column is a stack of three cards (the selected one is open, the others are
 * a line each) and whose right column is a wide chart card and two small ones that
 * change, and change colour, with the selection.
 *
 * On pinned layouts the showcase sticks while the page scrolls through a tall track, and one
 * continuous progress value (scroll, then a spring) drives everything: card heights, the
 * cross-fade of titles and bodies, and a progress bar. The charts cross-fade when the card
 * passes its midpoint. Elsewhere the same value is animated to the card you press. Everything
 * shown is the illustrative example (A owes B $100, B owes C $80, C owes A $70), labelled as such.
 */
export function ClearingShowcase() {
  const pinned = usePinned();
  const reduce = useReduceMotion();
  const [active, setActive] = useState<0 | 1 | 2>(0);
  const track = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const near = useInView(ref, { once: true, margin: "300px" });

  const { scrollYProgress: runProgress } = useScroll({ target: track, offset: [`start ${TOP}px`, "end end"] });
  const { scrollYProgress: enter } = useScroll({ target: track, offset: ["start 95%", `start ${TOP}px`] });
  const scale = useTransform(enter, [0, 1], [0.92, 1]);
  const lift = useTransform(enter, [0, 1], [56, 0]);

  // Unpinned layouts: progress is animated to the card you pressed.
  const manual = useMotionValue(0.5 / ITEMS.length);
  const spring = useSpring(0.5 / ITEMS.length, { stiffness: 120, damping: 26, mass: 0.6 });
  const smooth = spring;
  const source = pinned ? runProgress : manual;

  useEffect(() => {
    // The cards sit in thirds: card i is fully open at (i + 0.5) / 3. Before the track starts and after it
    // ends the progress is 0 or 1, so it is held at the first or last card instead of showing a half-open one.
    const held = (v: number) => Math.min(0.5 / ITEMS.length * 5, Math.max(0.5 / ITEMS.length, v));
    spring.jump(held(source.get()));
    return source.on("change", (v) => spring.set(held(v)));
  }, [source, spring]);

  useMotionValueEvent(runProgress, "change", (p) => {
    if (!pinned) return;
    const i = Math.min(ITEMS.length - 1, Math.max(0, Math.floor(p * ITEMS.length))) as 0 | 1 | 2;
    setActive((cur) => (cur === i ? cur : i));
  });

  const choose = (i: 0 | 1 | 2) => {
    if (pinned && track.current) {
      const top = track.current.getBoundingClientRect().top + window.scrollY - TOP;
      const span = track.current.offsetHeight - window.innerHeight + TOP;
      scrollToY(top + ((i + 0.5) / ITEMS.length) * span);
      return;
    }
    setActive(i);
    animate(manual, (i + 0.5) / ITEMS.length, { duration: reduce ? 0 : 0.4 });
  };

  const rows = useTransform(smooth, (p) => {
    const w = ITEMS.map((_, i) => openness(p, i) + 0.0001);
    return w.map((x) => `minmax(4.5rem,${x}fr)`).join(" ");
  });
  const bar = useTransform(runProgress, [0, 1], [0, 1]);

  if (!pinned) {
    return (
      <div ref={ref}>
        <div className="flex flex-col gap-6 rounded-shell bg-grey-100 p-2 sm:p-3">
          {ITEMS.map((it, i) => (
            <MobileGroup key={it.title} item={it} index={i as 0 | 1 | 2} near={near} />
          ))}
        </div>
        <p className="t-label mt-3 text-grey-600">Illustrative arithmetic, not data.</p>
      </div>
    );
  }

  return (
    <div ref={track} style={pinned ? { height: `${ITEMS.length * 100 + 40}vh` } : undefined}>
      <div ref={ref} className={pinned ? "sticky" : ""} style={pinned ? { top: TOP } : undefined}>
        <m.div
          className="rounded-shell bg-grey-100 p-3 [--sh:40rem] lg:[--sh:min(36rem,calc(100vh-11rem))]"
          style={pinned ? { scale, y: lift, transformOrigin: "50% 0%" } : undefined}
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <m.div
              className="grid h-[var(--sh)] gap-3 [--body-h:calc(var(--sh)-10.5rem)]"
              style={{ gridTemplateRows: rows }}
            >
              {ITEMS.map((it, i) => (
                <Row key={it.title} item={it} index={i} smooth={smooth} active={i === active} onChoose={() => choose(i as 0 | 1 | 2)} />
              ))}
            </m.div>

            {near ? (
              <div className="relative lg:h-[var(--sh)]">
                <AnimatePresence mode="wait" initial={false}>
                  <m.div
                    key={active}
                    initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }}
                    exit={{ opacity: 0, y: -16, filter: "blur(4px)", transition: { duration: 0.25, ease: "easeIn" } }}
                    className="h-full"
                  >
                    <ShowcaseCharts active={active} />
                  </m.div>
                </AnimatePresence>
              </div>
            ) : (
              <ChartSkeleton />
            )}
          </div>
        </m.div>

        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="t-label text-grey-600">Illustrative arithmetic, not data.</p>
          {pinned ? (
            <div className="flex items-center gap-3" aria-hidden="true">
              <span className="t-label text-grey-600">Scroll</span>
              <span className="h-[3px] w-28 overflow-hidden rounded-full bg-ink-soft/10">
                <m.span className="block h-full origin-left rounded-full bg-ink-soft" style={{ scaleX: bar }} />
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
