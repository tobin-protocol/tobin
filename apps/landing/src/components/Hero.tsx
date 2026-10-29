"use client";

import {
  animate,
  m,
  motionValue,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import { compactMode, foldProgress as p, useViewportSync, viewportH, viewportW } from "@/lib/fold";
import { lockScroll, scrollToY } from "@/lib/lenis";
import { links } from "@/lib/site";
import { useCompact, useHeroPinned } from "@/lib/stage";
import { HeroMedia, HeroMirror } from "./HeroMedia";
import { Arrow, ButtonLink, Container } from "./ui";
import { StencilText } from "./StencilText";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** One tween of the fold: waits 0.35s, then runs 1.1s on cubic-bezier(0.65, 0, 0.35, 1). */
const FOLD_DELAY = 0.25;
const FOLD_DURATION = 0.9;
/** The lock always ends: if a tween has not finished by now, jump to its end state. */
const FAILSAFE_MS = 2600;

/**
 * Three stacked layers fold into concentric rounded squares. Each layer is the
 * viewport, scaled to `scale` and clipped to a centred square (an inset of
 * (width - height) / 2 on each side, so the square is exactly the viewport height
 * before scaling) with corner radius `radius` (px at 700px tall). Layer 1 is the
 * photo, repeated on each layer.
 */
const LAYERS = [
  { scale: 0.4986, radius: 64.18 },
  { scale: 0.4286, radius: 84 },
  { scale: 0.3043, radius: 118.31 },
] as const;

/**
 * The compact (phone) fold: the same concentric squares, sized from the viewport width and
 * fitted to the room left between the nav and the intro block. A layer is scaled to `scale`
 * and clipped to a centred square of side = the viewport width before scaling (an inset of
 * (height - width) / 2 top and bottom); `radius` is in px before scaling. The three scales are
 * in the ratio below; the outer one is chosen by `compactGeom`.
 */
const COMPACT_LAYERS = [
  { ratio: 1, radius: 38 },
  { ratio: 0.857, radius: 50 },
  { ratio: 0.614, radius: 70 },
] as const;
/** Headline scale in the compact fold, and the gap between a headline block and the square. */
const COMPACT_LINE_SCALE = 0.62;
const COMPACT_GAP = 18;
/** The hero's own box (not the window): the layers, headline and intro all live inside it. */
const heroW = motionValue(393);
const heroH = motionValue(852);
/** Room kept clear at the top for the black nav bar, and between the stack and the intro block. */
const COMPACT_TOP = 82;
const COMPACT_BOTTOM_GAP = 10;

/** useTransform's typings only take homogeneous inputs, so mixed lists are cast through this. */
type Mixed = MotionValue<number>[];
type CompactGeom = { s0: number; shift: number; final1: number; final2: number; c1: number; c2: number };

/**
 * Where everything goes in the compact fold (hero coordinates, px). The headline block 1, the
 * square and the headline block 2 form a stack that is centred in the room between the nav and
 * the intro block (height `hb`); the square shrinks (never below 34% of the width) if the room is
 * short. `a` and `b` are the unscaled heights of the two headline blocks, `H` the hero height.
 */
function compactGeom(w: number, H: number, a: number, b: number, hb: number): CompactGeom {
  const ls = COMPACT_LINE_SCALE;
  const top = COMPACT_TOP;
  const bottom = H - hb - COMPACT_BOTTOM_GAP;
  const blocks = (a + b) * ls + 2 * COMPACT_GAP;
  const side = Math.max(0.34 * w, Math.min(0.7 * w, bottom - top - blocks));
  const slack = bottom - top - (blocks + side);
  const ySq = top + slack / 2 + a * ls + COMPACT_GAP + side / 2;
  const T = a + b;
  return {
    s0: side / w,
    shift: ySq - H / 2,
    // Block centres: stacked and centred at the start, clear of the square at the end.
    c1: H / 2 - T / 2 + a / 2,
    c2: H / 2 + T / 2 - b / 2,
    final1: ySq - side / 2 - COMPACT_GAP - (a * ls) / 2,
    final2: ySq + side / 2 + COMPACT_GAP + (b * ls) / 2,
  };
}

function useLayer(i: number, geom: MotionValue<CompactGeom>) {
  const { scale: end, radius } = LAYERS[i];
  const compactEnd = COMPACT_LAYERS[i];
  const scale = useTransform([p, compactMode, geom] as unknown as Mixed, ([v, c, g]: number[]) => {
    const geo = g as unknown as CompactGeom;
    return 1 + ((c ? geo.s0 * compactEnd.ratio : end) - 1) * v;
  });
  const y = useTransform([p, compactMode, geom] as unknown as Mixed, ([v, c, g]: number[]) =>
    c ? (g as unknown as CompactGeom).shift * v : 0,
  );
  const clipPath = useTransform([p, viewportW, viewportH, compactMode, heroW, heroH], ([v, w, h, c, hw, hh]: number[]) => {
    if (c) {
      const insetV = ((hh - hw) / 2) * v;
      return `inset(${insetV}px 0px round ${compactEnd.radius * v}px)`;
    }
    const inset = ((w - h) / 2) * v;
    const round = radius * (h / 700) * v;
    return `inset(0px ${inset}px round ${round}px)`;
  });
  // Layers 2 and 3 repeat the photo and fade in as the fold begins.
  const opacity = useTransform(p, (v) => (i === 0 ? 1 : clamp01(v / 0.25)));
  return { scale, y, clipPath, opacity };
}

/**
 * Hero fold. At the top of the page the first wheel, touch swipe or key press
 * (ArrowDown, PageDown, Space) waits 0.35s and runs one 1.1s tween of `foldProgress`
 * while the page stays at scroll 0; every visual below derives from that value.
 * Safeguards: the lock always ends (a 2.6s failsafe jumps to the end state); the
 * fold is skipped (settled) whenever the page is not at the top, so anchor links,
 * `scrollTo` and a restored scroll position jump straight to the settled state; the
 * "Scroll to explore" button runs it for keyboard users, and Tab simply moves
 * past the hero. On phones and small tablets (COMPACT_QUERY) the same fold runs vertically: the
 * layers become a rounded square, the first headline block moves up above it and the second
 * down below it, and a swipe triggers it. Where neither query matches (short, reduced motion) none
 * of this runs: the hero is a plain dark section.
 */
// "Scroll to explore" shimmers: a bright band sweeps across the letters (clipped to the text).
const SHIMMER: CSSProperties = {
  backgroundImage: "linear-gradient(100deg, rgb(255 255 255 / 0.72) 0%, rgb(255 255 255 / 0.72) 35%, #fff 50%, rgb(255 255 255 / 0.72) 65%, rgb(255 255 255 / 0.72) 100%)",
  backgroundSize: "200% 100%",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  color: "transparent",
};

export function Hero() {
  const line1 = useRef<HTMLSpanElement>(null);
  const line2 = useRef<HTMLSpanElement>(null);
  const busy = useRef(false);
  const runRef = useRef<((to: 0 | 1) => void) | null>(null);
  const pinned = useHeroPinned();
  const compact = useCompact();
  // Both layouts run the fold; they differ in geometry (compact splits the headline vertically).
  const fold = pinned || compact;
  useViewportSync();
  useLayoutEffect(() => {
    compactMode.set(compact ? 1 : 0);
  }, [compact]);

  // Unscaled widths of the two headline lines, to park them beside the squares.
  const w1 = useMotionValue(0);
  const w2 = useMotionValue(0);
  const hh1 = useMotionValue(0);
  const hh2 = useMotionValue(0);
  const hbh = useMotionValue(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!fold) return;
    const measure = () => {
      w1.set(line1.current?.offsetWidth ?? 0);
      w2.set(line2.current?.offsetWidth ?? 0);
      hh1.set(line1.current?.offsetHeight ?? 0);
      hh2.set(line2.current?.offsetHeight ?? 0);
      hbh.set(bottomRef.current?.offsetHeight ?? 0);
      heroW.set(sectionRef.current?.offsetWidth ?? 393);
      heroH.set(sectionRef.current?.offsetHeight ?? 852);
    };
    measure();
    void document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    if (sectionRef.current) ro.observe(sectionRef.current);
    return () => {
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, [fold, w1, w2, hh1, hh2, hbh]);

  // ---- the wheel / touch / key triggered tween ---------------------------------
  useEffect(() => {
    // The first client render still reports "not pinned" (hydration uses the server value), so this
    // branch must not touch the fold: only a real pinned or compact layout decides where it starts.
    if (!fold) return;
    p.set(window.scrollY > 2 ? 1 : 0);
    let failsafe: ReturnType<typeof setTimeout> | undefined;
    let controls: ReturnType<typeof animate> | undefined;

    const release = () => {
      busy.current = false;
      clearTimeout(failsafe);
      lockScroll(false);
    };
    const run = (to: 0 | 1) => {
      if (busy.current || p.get() === to) return;
      busy.current = true;
      lockScroll(true);
      controls = animate(p, to, {
        duration: FOLD_DURATION,
        delay: FOLD_DELAY,
        ease: [0.65, 0, 0.35, 1],
        onComplete: () => {
          release();
          if (to === 1 && !compactMode.get()) scrollToY(53); // Ondo's small release scroll (not on phones: the stack is fitted to the screen)
        },
      });
      failsafe = setTimeout(() => {
        controls?.stop();
        p.set(to);
        release();
      }, FAILSAFE_MS);
    };

    const atTop = () => window.scrollY <= 1;
    const consume = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const onWheel = (e: WheelEvent) => {
      if (!atTop()) return;
      if (busy.current) return consume(e);
      if (e.deltaY > 0 && p.get() < 1) {
        consume(e);
        run(1);
      } else if (e.deltaY < 0 && p.get() >= 1) {
        consume(e);
        run(0);
      }
    };
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!atTop()) return;
      const dy = startY - (e.touches[0]?.clientY ?? startY);
      if (busy.current) return consume(e);
      if (dy > 12 && p.get() < 1) {
        consume(e);
        run(1);
      } else if (dy < -12 && p.get() >= 1) {
        consume(e);
        run(0);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (!atTop() || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName)) return;
      const down = e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ";
      const up = e.key === "ArrowUp" || e.key === "PageUp" || e.key === "Home";
      if (busy.current && (down || up)) return consume(e);
      if (down && p.get() < 1) {
        consume(e);
        run(1);
      } else if (up && p.get() >= 1) {
        consume(e);
        run(0);
      }
    };
    // Anything that moves the page off the top (anchor link, scrollTo, scrollbar, restored
    // position) settles the fold at once.
    const onScroll = () => {
      // While the tween runs the page is held at 0: if the browser scrolls anyway (it can latch a
      // wheel gesture that started before the lock), snap straight back.
      if (busy.current) {
        if (window.scrollY > 0) window.scrollTo(0, 0);
        return;
      }
      if (window.scrollY > 2 && p.get() < 1) p.set(1);
    };

    const opts = { passive: false, capture: true } as const;
    window.addEventListener("wheel", onWheel, opts);
    window.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    window.addEventListener("touchmove", onTouchMove, opts);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, { passive: true });
    runRef.current = run;
    return () => {
      window.removeEventListener("wheel", onWheel, opts);
      window.removeEventListener("touchstart", onTouchStart, true);
      window.removeEventListener("touchmove", onTouchMove, opts);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll);
      runRef.current = null;
      controls?.stop();
      release();
    };
  }, [fold]);

  const geom = useTransform([heroW, heroH, hh1, hh2, hbh], ([w, H, a, b, hb]: number[]) => compactGeom(w, H, a, b, hb));
  const l1 = useLayer(0, geom);
  const l2 = useLayer(1, geom);
  const l3 = useLayer(2, geom);

  // Headline lines. Pinned: shrink, move apart horizontally to either side of the squares and come
  // level (the two lines are 1.05em apart, so half of that closes the gap). Compact: the first block
  // moves up above the square and the second down below it, both shrinking.
  const target = useTransform([viewportW, viewportH, w1, w2, compactMode], ([vw, vh, a, b, c]: number[]) => {
    if (c) return COMPACT_LINE_SCALE;
    const half = (LAYERS[0].scale * vh) / 2;
    const room = vw / 2 - half - 28 - 44;
    const widest = Math.max(a, b) || 1;
    return Math.min(0.85, Math.max(0.35, room / widest));
  });
  const lineScale = useTransform([p, target], ([v, s]: number[]) => 1 + (s - 1) * v);
  const xLeft = useTransform([p, target, w1, viewportH, compactMode], ([v, s, w, vh, c]: number[]) => {
    if (c) return 0;
    return -v * ((LAYERS[0].scale * vh) / 2 + 28 + (w * s) / 2);
  });
  const xRight = useTransform([p, target, w2, viewportH, compactMode], ([v, s, w, vh, c]: number[]) => {
    if (c) return 0;
    return v * ((LAYERS[0].scale * vh) / 2 + 28 + (w * s) / 2);
  });
  // Compact: block 1 rises above the square and block 2 sinks below it (positions from compactGeom).
  const yDown = useTransform([p, geom, compactMode] as unknown as Mixed, ([v, g, c]: number[]) => {
    const geo = g as unknown as CompactGeom;
    return c ? `${(geo.final1 - geo.c1) * v}px` : `${0.525 * v}em`;
  });
  const yUp = useTransform([p, geom, compactMode] as unknown as Mixed, ([v, g, c]: number[]) => {
    const geo = g as unknown as CompactGeom;
    return c ? `${(geo.final2 - geo.c2) * v}px` : `${-0.525 * v}em`;
  });

  const ink = useTransform(p, (v) => clamp01((v - 0.5) / 0.4));
  const exploreOpacity = useTransform(p, (v) => 1 - clamp01(v / 0.15));
  const exploreVisibility = useTransform(p, (v) => (v > 0.4 ? "hidden" : "visible"));
  const bottomOpacity = useTransform(p, (v) => clamp01((v - 0.6) / 0.3));
  const bottomVisibility = useTransform(p, (v) => (v < 0.55 ? "hidden" : "visible"));
  const scrimOpacity = useTransform(p, (v) => 1 - clamp01(v / 0.5));

  const vars = fold ? ({ "--t": ink } as unknown as CSSProperties) : undefined;

  const layerClass = "absolute inset-0 overflow-hidden";
  // A flat 35% tint keeps the white nav, status bar and headline at AA over the pale sky; it fades out as the layers shrink.
  const scrim = (
    <m.div
      className="absolute inset-0 bg-ink-soft/35"
      style={fold ? { opacity: scrimOpacity } : undefined}
    />
  );
  const poster = <HeroMirror />;

  return (
    <m.section
      ref={sectionRef}
      aria-labelledby="hero-title"
      data-surface="dark"
      className={`hero hero-static ${compact ? "!h-svh !min-h-0 !justify-center !bg-paper !p-0" : ""}`}
      style={vars}
    >
      {/* Picture layers: decorative. Layer 1 is the photo; 2 and 3 only exist pinned. */}
      <div aria-hidden="true" className="absolute inset-0 -z-0">
        <m.div
          className={layerClass}
          style={fold ? { scale: l1.scale, y: l1.y, clipPath: l1.clipPath } : undefined}
        >
          <HeroMedia priority />
          {scrim}
        </m.div>
        {fold ? (
          <>
            <m.div
              className={layerClass}
              style={{ scale: l2.scale, y: l2.y, clipPath: l2.clipPath, opacity: l2.opacity }}
            >
              {poster}
              {scrim}
            </m.div>
            <m.div
              className={layerClass}
              style={{ scale: l3.scale, y: l3.y, clipPath: l3.clipPath, opacity: l3.opacity }}
            >
              {poster}
              {scrim}
            </m.div>
          </>
        ) : null}
      </div>

      {/* The status bar and the nav are transparent, so a flat-to-clear band at the top keeps their white text at AA over the pale sky; it fades out with the fold. */}
      <m.div
        aria-hidden="true"
        className="hero-topband pointer-events-none absolute inset-x-0 top-0 h-56"
        style={fold ? { opacity: scrimOpacity } : undefined}
      />

      <div className={`hero-top ${compact ? "absolute inset-0 flex flex-col items-center justify-center text-center" : ""}`}>
        <Container className="relative">
          <h1
            id="hero-title"
            aria-label="Welcome to the Future of Institutional Clearing"
            className="t-h1 fold-ink text-balance"
          >
            <m.span
              ref={line1}
              className={`block w-fit md:mx-auto ${compact ? "mx-auto text-center" : ""}`}
              style={fold ? { x: xLeft, y: yDown, scale: lineScale } : undefined}
            >
              <StencilText text="Welcome to the Future" />
            </m.span>
            <m.span
              ref={line2}
              className={`block w-fit md:mx-auto ${compact ? "mx-auto text-center" : ""}`}
              style={fold ? { x: xRight, y: yUp, scale: lineScale } : undefined}
            >
              <StencilText text="of Institutional Clearing" />
            </m.span>
          </h1>
        </Container>
      </div>

      <m.div
        ref={bottomRef}
        className={`hero-bottom ${compact ? "absolute inset-x-0 bottom-0 !mt-0" : ""}`}
        style={fold ? { opacity: bottomOpacity, visibility: bottomVisibility } : undefined}
      >
        <Container className={`flex flex-col gap-6 pb-12 ${compact ? "items-center text-center" : ""}`}>
          <p className="t-lead fold-soft max-w-[40rem]">
            Tobin is an open clearing protocol that helps financial institutions net payment
            obligations and settle the resulting balances on Stellar.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <ButtonLink href="#how-it-works" variant="light">
              How it works
            </ButtonLink>
            {links.github ? (
              <ButtonLink href={links.github} variant="dark">
                View on GitHub
              </ButtonLink>
            ) : null}
          </div>
        </Container>
      </m.div>

      {/* Fold layouts only: "Scroll to explore" (a swipe, on phones) is also the keyboard way to run the fold. */}
      {fold ? (
        <m.button
          type="button"
          onClick={() => runRef.current?.(1)}
          className="t-ui absolute inset-x-0 bottom-10 mx-auto inline-flex min-h-11 w-fit items-center gap-2 rounded-btn px-3 text-paper"
          style={{ opacity: exploreOpacity, visibility: exploreVisibility }}
        >
          {/* Driven by motion, not CSS keyframes, so it runs wherever the hero's own motion runs. */}
          <m.span
            style={SHIMMER}
            animate={{ backgroundPosition: ["200% 0%", "-100% 0%"] }}
            transition={{ duration: 1.9, repeat: Infinity, ease: "linear" }}
          >
            {compact ? "Swipe to explore" : "Scroll to explore"}
          </m.span>
          <m.span
            aria-hidden="true"
            className="inline-block"
            animate={{ y: [0, 9, 0] }}
            transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
          >
            <span className="inline-block rotate-90">
              <Arrow />
            </span>
          </m.span>
        </m.button>
      ) : null}

    </m.section>
  );
}
