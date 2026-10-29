"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Reveal } from "./Reveal";
import { Container, Section } from "./ui";

// Decorative and aria-hidden, so it is loaded on the client only, keeping it out of the first hydration.
const DotGlobe = dynamic(() => import("./DotGlobe").then((mod) => mod.DotGlobe), {
  ssr: false,
  loading: () => <div aria-hidden="true" style={{ height: 434 }} />,
});

/** A long ease-out: fast start, soft landing. */
const EASE = [0.16, 1, 0.3, 1] as const;
const ROLL_MS = 3000;

/** Each phrase has its own colour from the data palette, and a paragraph that uses only README facts. */
const PHRASES = [
  {
    word: "Open",
    colour: "text-green-ink",
    tint: "--color-green-ink",
    body: "The code, documentation and specification the project owns or controls are licensed under Apache-2.0, and the repository is public. The Tobin name and logo are not covered by that licence.",
  },
  {
    word: "Deterministic",
    colour: "text-chart-ink",
    tint: "--color-chart-ink",
    body: "Independent implementations given the same accepted obligations, rules and algorithm version must produce identical results. The engine is a calculator, not an authority.",
  },
  {
    word: "Participant-signed",
    colour: "text-purple-ink",
    tint: "--color-purple-ink",
    body: "No clearing engine can finalize a session alone. A result becomes final only when the participants with non-zero net positions have signed it.",
  },
] as const;

/**
 * Ondo's manifesto layout. On wide screens: the eyebrow and "Tobin is" on the left, the
 * dot sphere in the middle and the rolling phrase on the right, all on one line, with the
 * paragraph bottom-left and the three numbered circles bottom-right. Below 1024px it
 * stacks, centred. The phrase rolls every ~6.3s (the old one rolls up out of a mask, the
 * new one rises from below in about 0.3s) and the sphere's colour glides to the phrase's
 * colour; hovering the sphere scatters its dots. It always autoplays and loops (no pause
 * and no hold), and the numbered buttons pick a phrase.
 */
export function Manifesto() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % PHRASES.length), ROLL_MS);
    return () => clearInterval(id);
  }, []);

  const cur = PHRASES[idx];

  return (
    <Section id="manifesto" labelledBy="manifesto-title" tone="light">
      <Container>
        <div>
          <div className="grid items-center gap-8 text-center lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-0 lg:text-left">
            <div>
              <p className="t-ui text-grey-600">What Tobin is</p>
              <h2
                id="manifesto-title"
                className="t-h2 mt-6 lg:[font-size:clamp(2.25rem,3.4vw,3.25rem)] lg:leading-[1.05]"
              >
                <span className="block">Tobin is</span>
                {/* Under 1024px the phrase stacks right under it; from 1024px it moves to the right of the sphere. */}
                <span className="relative mt-1 block h-[1.2em] overflow-hidden lg:hidden" aria-hidden="true">
                  <PhraseRoll cur={cur} />
                </span>
              </h2>
            </div>

            <Reveal from="scale" className="mx-auto">
              <DotGlobe tint={cur.tint} />
            </Reveal>

            <div className="hidden lg:block">
              {/* An invisible eyebrow keeps the phrase on the same line as "Tobin is". */}
              <p aria-hidden="true" className="t-ui invisible">What Tobin is</p>
              <div
                className="t-h2 relative mt-6 h-[1.2em] overflow-hidden text-right lg:[font-size:clamp(2.25rem,3.4vw,3.25rem)] lg:leading-[1.05]"
                aria-live="polite"
              >
                <span className="sr-only">{cur.word}</span>
                <span aria-hidden="true">
                  <PhraseRoll cur={cur} align="right" />
                </span>
              </div>
            </div>
          </div>

          <Reveal className="mt-10 grid items-end gap-8 lg:mt-14 lg:grid-cols-2" delay={0.1}>
            <div className="relative min-h-[9rem] max-w-[36rem] overflow-hidden md:min-h-[7.5rem]" aria-live="off">
              <AnimatePresence initial={false}>
                <m.p
                  key={cur.word}
                  className="t-lead absolute inset-x-0 top-0 text-grey-850"
                  initial={{ y: "100%", opacity: 0 }}
                  animate={{ y: "0%", opacity: 1, transition: { duration: 0.55, ease: EASE, delay: 0.06 } }}
                  exit={{ y: "-100%", opacity: 0, transition: { duration: 0.45, ease: EASE } }}
                >
                  {cur.body}
                </m.p>
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-center gap-3 lg:justify-end">
              {PHRASES.map((p, i) => (
                <button
                  key={p.word}
                  type="button"
                  onClick={() => setIdx(i)}
                  aria-label={`${String(i + 1).padStart(2, "0")}, Tobin is ${p.word.toLowerCase()}`}
                  aria-pressed={i === idx}
                  className={`t-ui inline-flex h-11 min-w-9 items-center justify-center px-1.5 tabular-nums transition-colors duration-200 ${i === idx ? "text-ink" : "text-grey-600 hover:text-ink"}`}
                >
                  {String(i + 1).padStart(2, "0")}
                </button>
              ))}
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

/** The rolling word: the old one leaves upward, the new one rises from below. */
function PhraseRoll({ cur, align = "center" }: { cur: (typeof PHRASES)[number]; align?: "center" | "right" }) {
  return (
    <AnimatePresence initial={false}>
      <m.span
        key={cur.word}
        className={`absolute inset-x-0 top-0 block whitespace-nowrap ${align === "right" ? "text-right" : "text-center"} ${cur.colour}`}
        initial={{ y: "110%" }}
        animate={{ y: "0%" }}
        exit={{ y: "-110%" }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        {cur.word}
      </m.span>
    </AnimatePresence>
  );
}
