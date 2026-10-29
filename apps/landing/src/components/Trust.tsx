"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { usePinned, useReduceMotion } from "@/lib/stage";
import { Parallax, Reveal } from "./Reveal";
import { Container, Eyebrow } from "./ui";

const CARDS = [
  {
    title: "Open and licensed",
    body: "The code, documentation and specification are licensed under Apache-2.0, and the repository is public. The Tobin name and logo are not licensed under it.",
  },
  {
    title: "Deterministic",
    body: "The same accepted obligations, rules and algorithm version give identical results.",
  },
  {
    title: "Participant-signed finality",
    body: "The engine is a calculator, not an authority. A result is final only when the participants with non-zero net positions have signed it.",
  },
  {
    title: "Non-custodial by design",
    body: "That is a technical description of the design, not a legal one. It depends on controls that are decided but not built.",
  },
  {
    title: "Honest about status",
    body: "Not independently audited, not production-ready, and tested on the Stellar testnet only. The testnet report is unpublished.",
  },
];

const IS_NOT = [
  "An anchor.",
  "A custodian.",
  "A payment processor.",
  "A DEX or liquidity pool.",
  "An FX provider.",
  "A lender or insurer.",
  "A bank.",
  "A token issuer: there is no protocol token.",
  "A replacement for SEP-31, SEP-24 or SEP-38.",
];

const AUTOPLAY_S = 4.5;

const CARD_GAP = 12;
const PEEK = 36;

/**
 * Phones and small tablets (Ondo's mobile trust cards): the five cards in one row that slides,
 * the active card white and nearly full width, the next one peeking in glass at the right edge.
 * It counts positions up without wrapping (so it keeps sliding the same way), advances when the
 * ring timer ends, and can be swiped; the cards are buttons too.
 */
function TrustCarousel() {
  const n = CARDS.length;
  const wrap = (k: number) => ((k % n) + n) % n;
  const [pos, setPos] = useState(0);
  const [width, setWidth] = useState(360);
  const box = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const gutter = 22;
  const cardW = Math.min(width - gutter - PEEK, 520);
  const x = gutter - pos * (cardW + CARD_GAP);

  return (
    <div
      ref={box}
      role="region"
      aria-roledescription="carousel"
      aria-label="What Tobin is"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          setPos((k) => k + 1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          setPos((k) => k - 1);
        }
      }}
      className="-mx-[22px] touch-pan-y overflow-hidden md:-mx-[44px]"
      onTouchStart={(e) => {
        start.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const s = start.current;
        start.current = null;
        const end = e.changedTouches[0]?.clientX;
        if (s === null || end === undefined) return;
        if (end - s < -40) setPos((k) => k + 1);
        else if (end - s > 40) setPos((k) => k - 1);
      }}
    >
      <div
        className="relative transition-transform duration-[500ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ height: 300, transform: `translateX(${x + (width < 768 ? 0 : 22)}px)` }}
      >
        {[-2, -1, 0, 1, 2].map((d) => pos + d).map((k) => {
          const c = CARDS[wrap(k)];
          const on = k === pos;
          return (
            <article
              key={k}
              className={`absolute top-0 flex h-[300px] flex-col rounded-card p-[26px] transition-colors duration-300 ${on ? "bg-paper text-ink" : "glass text-paper"}`}
              style={{ width: cardW, left: k * (cardW + CARD_GAP) }}
            >
              <button type="button" onClick={() => setPos(k)} className="flex flex-col items-start text-left">
                <span className={`badge ${on ? "" : "!text-paper"}`}>{String(wrap(k) + 1).padStart(2, "0")}</span>
                <span className="mt-4 text-[1.25rem] font-medium leading-tight tracking-[-0.02em]">{c.title}</span>
              </button>
              {on ? <p className="t-serif mt-4 text-[1.0625rem] text-grey-850">{c.body}</p> : null}
              {on ? (
                <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" className="mt-auto -rotate-90 self-end">
                  <circle cx="6" cy="6" r="5" fill="none" className="stroke-grey-200" strokeWidth="1.5" />
                  <circle
                    key={k}
                    cx="6"
                    cy="6"
                    r="5"
                    fill="none"
                    className="ring-run stroke-ink-soft"
                    strokeWidth="1.5"
                    style={{ animationDuration: `${AUTOPLAY_S}s` }}
                    onAnimationEnd={() => setPos((v) => v + 1)}
                  />
                </svg>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

/**
 * What Tobin is, and is not (Ondo's trust cards). A black section over the darkened
 * hero poster. Pinned layouts get a row of five cards: the active one is white and
 * wide, the others are glass; it advances every 4.5s with a 12px ring timer, always
 * autoplaying and looping (no pause), answers the arrow keys, and the active card
 * widens over 0.3s ease-out. Narrower or shorter screens get a swipeable carousel (TrustCarousel);
 * under reduced motion all five are white cards in a grid with no autoplay. Below the cards, the "Tobin is not" list.
 */
export function Trust() {
  const pinned = usePinned();
  const reduce = useReduceMotion();
  const [active, setActive] = useState(0);
  const n = CARDS.length;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setActive((i) => (i + 1) % n);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setActive((i) => (i - 1 + n) % n);
    }
  };

  return (
    <section
      id="trust"
      aria-labelledby="trust-title"
      data-surface="dark"
      className="surface-dark relative isolate overflow-hidden py-16 md:py-20 xl:py-[120px]"
    >
      <Parallax distance={70} className="absolute -inset-y-24 inset-x-0 -z-10">
        <Image src="/trust/trust-event.jpg" alt="" fill sizes="100vw" className="object-cover" />
      </Parallax>
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-b from-ink/70 to-ink/90" />

      <Container>
        <Reveal from="left">
          <Eyebrow>What it is</Eyebrow>
          <h2 id="trust-title" className="t-h3 mt-6 max-w-[22ch] text-balance">
            Plain about what Tobin is,
            <span className="block text-grey-400">and what it is not.</span>
          </h2>
        </Reveal>

        <Reveal from="right" className="mt-12 md:mt-16">
        {!pinned && !reduce ? (
          <TrustCarousel />
        ) : (
        <div
          role="region"
          aria-roledescription={pinned ? "carousel" : undefined}
          aria-label="What Tobin is"
          tabIndex={pinned ? 0 : undefined}
          onKeyDown={pinned ? onKey : undefined}
          className={`gap-3 ${pinned ? "flex" : "grid md:grid-cols-2"}`}
        >
          {CARDS.map((c, i) => {
            const on = !pinned || i === active;
            return (
              <article
                key={c.title}
                className={`flex flex-col rounded-card p-[30px] ${pinned ? "h-[264px] basis-0 transition-[flex-grow,background-color,color] duration-[300ms] ease-out" : ""} ${on ? "bg-paper text-ink" : "glass text-paper"} ${pinned ? (on ? "grow-[2]" : "grow") : ""}`}
              >
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  aria-expanded={on}
                  disabled={!pinned}
                  className="flex flex-col items-start text-left disabled:cursor-default"
                >
                  <span className={`badge ${on ? "" : "!text-paper"}`}>{String(i + 1).padStart(2, "0")}</span>
                  <span className="mt-4 text-[1.25rem] font-medium leading-tight tracking-[-0.02em]">
                    {c.title}
                  </span>
                </button>
                {on ? <p className="t-serif mt-4 text-[1.0625rem] text-grey-850">{c.body}</p> : null}
                {pinned && i === active ? (
                  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" className="mt-auto -rotate-90 self-end">
                    <circle cx="6" cy="6" r="5" fill="none" className="stroke-grey-200" strokeWidth="1.5" />
                    <circle
                      key={active}
                      cx="6"
                      cy="6"
                      r="5"
                      fill="none"
                      className="ring-run stroke-ink-soft"
                      strokeWidth="1.5"
                      style={{
                        animationDuration: `${AUTOPLAY_S}s`,
                      }}
                      onAnimationEnd={() => setActive((v) => (v + 1) % n)}
                    />
                  </svg>
                ) : null}
              </article>
            );
          })}
        </div>
        )}
        </Reveal>

        <Reveal className="mt-16 grid gap-6 md:mt-20 md:grid-cols-[1fr_2fr] md:gap-12">
          <h3 className="t-h4">Tobin is not</h3>
          <ul className="grid gap-x-12 md:grid-cols-2">
            {IS_NOT.map((t) => (
              <li key={t} className="rule-top py-4 text-[1.0625rem] leading-snug">
                {t}
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
