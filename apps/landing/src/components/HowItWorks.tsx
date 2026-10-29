"use client";

import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from "react";
import { HOW_CLOSING, HOW_STEPS } from "@/lib/how";
import { useReduceMotion } from "@/lib/stage";
import { Reveal } from "./Reveal";
import { Container, Eyebrow } from "./ui";

const pad = (n: number) => String(n + 1).padStart(2, "0");
const AUTOPLAY_MS = 4500;
const GAP = 16;
/** The active slide is the full content column (page gutter 44px each side, 1512px at most), like Ondo's. */
const GUTTER = 44;
/** Phones keep the 22px page gutter, so the card is the full screen width minus that. */
const GUTTER_PHONE = 22;
const SWIPE_PX = 40;
const CONTENT_MAX = 1512;

const IMG_W = 788;
const IMG_H = 317;

/**
 * The step illustration: 12px radius, 1px white-12% hairline, cropped to cover. The images
 * start on black, so the panel is black until they load (no layout shift: the ratio is set
 * by the wrapper). They are informational, so the alt text comes from how.ts.
 */
function Panel({
  step,
  sizes,
  preload = false,
}: {
  step: (typeof HOW_STEPS)[number];
  sizes: string;
  preload?: boolean;
}) {
  return (
    <div className="h-full w-full overflow-hidden rounded-[12px] border border-white/12 bg-black">
      <Image
        src={step.image}
        alt={step.alt}
        width={IMG_W}
        height={IMG_H}
        sizes={sizes}
        preload={preload}
        loading={preload ? undefined : "lazy"}
        className="h-full w-full object-cover object-center"
      />
    </div>
  );
}

const control =
  "inline-flex h-11 w-11 items-center justify-center rounded-btn bg-ink-soft/10 text-ink transition-colors duration-200 hover:bg-ink-soft/20";

/**
 * Five step cards as a carousel (Ondo's testimonial mechanics): the active slide is a
 * black panel, the others are #DEDEDE at 75% scale, peeking from both edges. It
 * advances every 4.5s on a 1s decelerating ease-out, always autoplaying and infinite (it keeps
 * sliding the same way and never rewinds from the last step to the first; no pause
 * button, no hold on hover or focus), and has prev/next squares; the arrow keys work when it has
 * focus. It is a carousel at every width (full-width card with the 22px page gutter on phones,
 * swipeable); only under reduced motion are the same five steps a plain list.
 */
export function HowItWorks() {
  // `pos` only ever counts up or down (it never wraps), so the track keeps sliding the same way;
  // the slide shown at a position is HOW_STEPS[pos mod n].
  const reduce = useReduceMotion();
  const [pos, setPos] = useState(0);
  const swipe = useRef<number | null>(null);
  const [width, setWidth] = useState(1200);
  const boxRef = useRef<HTMLDivElement>(null);
  const n = HOW_STEPS.length;
  const wrap = (k: number) => ((k % n) + n) % n;

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Always autoplaying: it never stops for hover or focus, and never rewinds.
  useEffect(() => {
    const id = setInterval(() => setPos((k) => k + 1), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, []);

  const gutter = width < 768 ? GUTTER_PHONE : GUTTER;
  const slideW = Math.min(width - gutter * 2, CONTENT_MAX - gutter * 2);
  const slideH = width < 768 ? 560 : Math.min(640, Math.max(520, slideW * 0.54));
  const x = width / 2 - (pos * (slideW + GAP) + slideW / 2);

  const go = (d: number) => setPos((k) => k + d);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    }
  };

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-title"
      className="surface-grey py-16 md:py-20 xl:py-[120px]"
    >
      <Container>
        <Reveal>
          <Eyebrow>Proposed design</Eyebrow>
          <h2 id="how-title" className="t-h2 mt-6">
            How it works
          </h2>
        </Reveal>
      </Container>

      {/* Reduced motion: a plain list. */}
      {reduce ? (
      <Container>
        <ol className="mt-10 grid gap-4 md:mt-14 md:grid-cols-2">
          {HOW_STEPS.map((s, i) => (
            <li key={s.title} className="rounded-card-s bg-black p-4 text-paper">
              <div className="aspect-[788/317]">
                <Panel step={s} sizes="(min-width: 1200px) 600px, (min-width: 768px) 50vw, 100vw" />
              </div>
              <div className="px-1 pb-2 pt-5">
                <span className="t-mono text-grey-400">{pad(i)}</span>
                <h3 className="t-h4 mt-3">{s.title}</h3>
                <p className="t-mono mt-2 text-grey-400">{s.role}</p>
                <p className="t-lead mt-3 max-w-[32rem] text-grey-200">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="t-lead mt-10 max-w-[40rem]">{HOW_CLOSING}</p>
      </Container>
      ) : (
      <div>
        <div
          ref={boxRef}
          role="region"
          aria-roledescription="carousel"
          aria-label="The five steps"
          tabIndex={0}
          onKeyDown={onKey}
          onTouchStart={(e) => {
            swipe.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const s = swipe.current;
            swipe.current = null;
            const end = e.changedTouches[0]?.clientX;
            if (s === null || end === undefined) return;
            if (end - s < -SWIPE_PX) go(1);
            else if (end - s > SWIPE_PX) go(-1);
          }}
          className="mt-10 touch-pan-y overflow-hidden md:mt-14"
        >
          <div
            aria-live="off"
            className="relative transition-transform duration-[1000ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{ height: slideH, transform: `translateX(${x}px)` }}
          >
            {[-2, -1, 0, 1, 2].map((d) => pos + d).map((k) => {
              const i = wrap(k);
              const s = HOW_STEPS[i];
              const on = k === pos;
              return (
                <div
                  key={k}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${n}`}
                  aria-hidden={on ? undefined : true}
                  className={`absolute bottom-0 flex flex-col justify-between rounded-card-s p-8 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none xl:p-10 ${on ? "scale-100 bg-ink text-paper" : "scale-75 bg-grey-200 text-ink"}`}
                  style={{
                    width: slideW,
                    height: slideH,
                    left: k * (slideW + GAP),
                    transformOrigin: on ? "center bottom" : k < pos ? "right bottom" : "left bottom",
                    // The slide moves over 1s, but its colours swap in 0.3s so text never sits long on a half-faded ground.
                    transitionProperty: "transform, background-color, color",
                    transitionDuration: "1000ms, 300ms, 300ms",
                  }}
                >
                  <div>
                    <p className="font-display text-[clamp(3rem,5vw,4.5rem)] font-medium leading-none tracking-[-0.03em]">
                      {pad(i)}
                    </p>
                    <h3 className="t-h5 mt-4">{s.title}</h3>
                    <p className={`t-mono mt-2 uppercase tracking-[0.08em] ${on ? "text-grey-400" : "text-grey-850"}`}>
                      {s.role}
                    </p>
                  </div>
                  {/* The panel takes whatever height is left and keeps its 2.49:1 ratio, so it
                      narrows (staying centred) rather than squeezing the sentence. Only the
                      active slide shows it: it fades in and rises 12px each time it activates. */}
                  <div className="flex min-h-0 flex-1 items-center justify-center py-4 xl:py-5">
                    <div
                      className={`h-full max-w-full transition-[opacity,transform] duration-[400ms] ease-out motion-reduce:transition-none ${on ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
                      style={{ aspectRatio: `${IMG_W} / ${IMG_H}` }}
                    >
                      <Panel step={s} preload={i === 0} sizes="(min-width: 1200px) 700px, 100vw" />
                    </div>
                  </div>
                  <p className="t-serif text-[clamp(1.25rem,2vw,1.875rem)] leading-[1.2]">{s.body}</p>
                </div>
              );
            })}
          </div>
        </div>

        <Container className="mt-6 flex flex-col gap-6 md:mt-8 md:flex-row md:items-center md:justify-between">
          <p className="t-lead max-w-[36rem]">{HOW_CLOSING}</p>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" className={control} onClick={() => go(-1)} aria-label="Previous step">
              <HugeiconsIcon icon={ArrowLeft01Icon} size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <button type="button" className={control} onClick={() => go(1)} aria-label="Next step">
              <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </Container>
      </div>
      )}
    </section>
  );
}
