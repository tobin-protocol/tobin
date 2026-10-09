import type { ReactNode } from "react";
import { Reveal } from "./Reveal";
import { Container } from "./ui";

const icon = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const steps = [
  {
    title: "Submit",
    body: "Institutions submit authenticated payment obligations.",
    glyph: icon(
      <>
        <path d="M12 3v11m0 0l-4-4m4 4l4-4" />
        <path d="M5 15v3a2 2 0 002 2h10a2 2 0 002-2v-3" />
      </>,
    ),
  },
  {
    title: "Clear",
    body: "Eligible obligations are grouped into clearing sessions.",
    glyph: icon(
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="15" r="1.1" fill="currentColor" stroke="none" />
      </>,
    ),
  },
  {
    title: "Net",
    body: "Tobin calculates deterministic net positions.",
    glyph: icon(
      <>
        <path d="M4 6l8 6m8-6l-8 6m0 0v7" />
      </>,
    ),
  },
  {
    title: "Settle",
    body: "Resulting positions are settled through Soroban on Stellar.",
    glyph: icon(
      <>
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </>,
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="pb-28 pt-8 md:pb-40">
      <Container>
        <Reveal>
          <p className="eyebrow">How Tobin works</p>
          <h2 id="how-title" className="text-title mt-4 max-w-[36rem] text-balance">
            Four stages, from obligation to settlement.
          </h2>
        </Reveal>

        <ol className="mt-14 grid gap-0 md:mt-20 md:grid-cols-4 md:gap-8">
          {steps.map((s, i) => {
            const last = i === steps.length - 1;
            return (
              <li key={s.title} className="relative pb-12 pl-16 last:pb-0 md:pb-0 md:pl-0">
                <span
                  className={`absolute left-0 top-0 flex h-11 w-11 items-center justify-center rounded-full border md:static ${last ? "border-signal bg-signal text-ink" : "border-paper/25 bg-paper/10 text-paper"}`}
                >
                  {s.glyph}
                </span>
                <Reveal delay={i * 0.08}>
                  <p className="tabular pt-0.5 font-mono text-xs tracking-[0.04em] text-ink-faint md:mt-6 md:pt-0">
                    0{i + 1}
                  </p>
                  <h3 className="text-heading mt-1.5">{s.title}</h3>
                  <p className="text-body mt-2 max-w-[17rem]">{s.body}</p>
                </Reveal>
                {!last ? (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-3 left-[1.375rem] top-14 w-px bg-paper/25 md:bottom-auto md:left-[3.5rem] md:right-[-1.25rem] md:top-[1.375rem] md:h-px md:w-auto"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>

        <Reveal delay={0.1}>
          <p className="mt-16 max-w-[40rem] text-[1.0625rem] leading-relaxed text-paper md:mt-20">
            Obligations in, net positions out. Because the calculation is
            deterministic, the same set of obligations always produces the same
            result.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
