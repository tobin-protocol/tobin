import type { CSSProperties } from "react";
import { EXAMPLE, EXAMPLE_OBLIGATIONS, usd } from "@/lib/clearing";
import { GrowBar, Reveal } from "./Reveal";
import { Container } from "./ui";

const netShare = EXAMPLE.settled / EXAMPLE.gross;

/** Each institution keeps one colour everywhere it appears. */
const PARTY: Record<string, { bg: string; fg: string; css: string }> = {
  A: { bg: "bg-accent", fg: "text-paper", css: "var(--color-accent)" },
  B: { bg: "bg-signal", fg: "text-ink", css: "var(--color-signal)" },
  C: { bg: "bg-sky", fg: "text-ink", css: "var(--color-sky)" },
};

type CardData = {
  label: string;
  amount: number;
  title: string;
  /** Institutions shown as tiles: [payer] or [payer, payee]. */
  parties: string[];
  sub?: string;
  /** Receivers read in the loud second hue; everything else in paper. */
  receives?: boolean;
};

const grossCards: CardData[] = EXAMPLE_OBLIGATIONS.map((o) => ({
  label: "Obligation",
  amount: o.amount,
  title: `${o.from} owes ${o.to}`,
  parties: [o.from, o.to],
}));

const netCards: CardData[] = EXAMPLE.positions.map((p) => ({
  label: "Net position",
  amount: Math.abs(p.net),
  title: `${p.party} ${p.net < 0 ? "pays" : "receives"}`,
  parties: [p.party],
  sub: `owes ${usd(p.owes)}, is owed ${usd(p.owed)}`,
  receives: p.net > 0,
}));

/** An app-icon style tile: rounded squircle, institution colour, Aalto initial. */
function Tile({ party, size }: { party: string; size: "lg" | "md" }) {
  const c = PARTY[party];
  return (
    <span
      className={`flex items-center justify-center rounded-[8%] font-display leading-none ${c.bg} ${c.fg} ${size === "lg" ? "h-24 w-24 text-[3.5rem] sm:h-28 sm:w-28 sm:text-[4rem]" : "h-14 w-14 text-[2.25rem] sm:h-16 sm:w-16 sm:text-[2.5rem]"}`}
    >
      {party}
    </span>
  );
}

function Card({ card, index }: { card: CardData; index: number }) {
  const lead = PARTY[card.parties[0]];
  return (
    <div
      style={{ "--c": lead.css } as CSSProperties}
      className="group mx-3 flex h-80 w-60 shrink-0 flex-col border border-paper/15 bg-paper/[0.04] p-6 transition-all duration-700 hover:border-(--c) hover:bg-paper/[0.08] sm:mx-4 sm:h-96 sm:w-72"
    >
      <div className="flex items-start justify-between text-paper/60 transition-colors duration-700 group-hover:text-paper">
        <span className="spaced">{card.label}</span>
        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-(--c)" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        {card.parties.length === 2 ? (
          <div className="flex items-center gap-3">
            <Tile party={card.parties[0]} size="md" />
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-paper/70">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
            <Tile party={card.parties[1]} size="md" />
          </div>
        ) : (
          <Tile party={card.parties[0]} size="lg" />
        )}
        <span
          className={`font-display text-[3.75rem] leading-none sm:text-[4.5rem] ${card.receives ? "text-signal" : "text-paper"}`}
        >
          {usd(card.amount)}
        </span>
        {card.sub ? (
          <span className="tabular font-mono text-[11px] tracking-[0.02em] text-paper/70">{card.sub}</span>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t border-paper/15 pt-4">
        <span className="text-sm font-semibold uppercase tracking-widest sm:text-base">{card.title}</span>
        <span className="tabular font-mono text-[10px] tracking-[0.2em] text-paper/60">0{index + 1}</span>
      </div>
    </div>
  );
}

/**
 * One marquee row. The list is repeated until a half is wider than any screen,
 * then doubled so the -50% loop is seamless. The second half is marked as a
 * duplicate so reduced-motion users get one tidy set of cards.
 */
function Row({ cards, reverse, offset }: { cards: CardData[]; reverse?: boolean; offset?: string }) {
  const half = [...cards, ...cards, ...cards];
  return (
    <div
      className={`marquee-row flex whitespace-nowrap ${reverse ? "animate-marquee-reverse" : "animate-marquee"}`}
      style={offset ? { marginLeft: offset } : undefined}
    >
      {[0, 1].flatMap((copy) =>
        half.map((card, i) => (
          <div key={`${copy}-${i}`} className={copy === 1 || i >= cards.length ? "marquee-dup" : undefined}>
            <Card card={card} index={i % cards.length} />
          </div>
        )),
      )}
    </div>
  );
}

export function Problem() {
  return (
    <section id="problem" aria-labelledby="problem-title" className="relative overflow-hidden pb-24 pt-28 md:pb-32 md:pt-40">
      <Container className="grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-12">
        <Reveal className="lg:col-span-7">
          <p className="eyebrow">The problem</p>
          <h2 id="problem-title" className="text-title mt-4 text-balance">
            Not every payment needs to settle individually.
          </h2>
        </Reveal>
        <Reveal delay={0.1} className="lg:col-span-5">
          <p className="text-lead max-w-[32rem]">
            When institutions owe one another money, settling every
            obligation separately can create unnecessary settlement volume.
            Each extra payment adds operational work, even when the
            obligations largely offset each other.
          </p>
          <p className="text-body mt-4 max-w-[32rem]">
            Clearing looks at the whole picture first, then settles only what
            is left.
          </p>
        </Reveal>
      </Container>

      <p className="spaced mt-16 px-5 text-center text-paper/70 md:mt-24">
        Illustrative example · Not real transaction data
      </p>

      {/* The cards, as text, for assistive tech; the moving band is decoration. */}
      <ul className="sr-only">
        {EXAMPLE_OBLIGATIONS.map((o) => (
          <li key={o.from}>
            {o.from} owes {o.to} {usd(o.amount)}
          </li>
        ))}
        {EXAMPLE.positions.map((p) => (
          <li key={p.party}>
            {p.party} {p.net < 0 ? "pays" : "receives"} {usd(Math.abs(p.net))}: owes {usd(p.owes)}, is owed {usd(p.owed)}
          </li>
        ))}
      </ul>

      <div aria-hidden="true" className="marquee-band relative flex origin-center flex-col gap-6 pb-14 pt-10 sm:gap-8 md:pb-20">
        <Row cards={grossCards} />
        <Row cards={netCards} reverse offset="-20vw" />
      </div>

      <Container className="mt-6 md:mt-10">
        <Reveal>
          <figure className="mx-auto max-w-5xl">
            <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch md:gap-5">
              {/* Heavy: everything settled one by one. */}
              <div className="flex min-h-[19rem] flex-col bg-signal-pastel p-7 text-ink sm:p-9">
                <h3 className="spaced text-ink-soft">Settled one by one</h3>
                <p className="font-display mt-6 text-[clamp(5.5rem,11vw,8.5rem)] leading-[0.9] tabular">
                  {usd(EXAMPLE.gross)}
                </p>
                <p className="mt-3 text-[0.9375rem] font-medium text-ink-soft">Gross settlement</p>
                <div aria-hidden="true" className="mt-auto pt-8">
                  <div className="h-3 rounded-full bg-ink/10">
                    <GrowBar scale={1} className="h-full w-full rounded-full bg-ink" />
                  </div>
                </div>
              </div>

              <div aria-hidden="true" className="hidden items-center md:flex">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-signal text-ink">
                  <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </span>
              </div>

              {/* Light: only what is left after clearing. */}
              <div className="flex min-h-[19rem] flex-col bg-accent p-7 text-paper sm:p-9">
                <h3 className="spaced">After clearing: net positions</h3>
                <p className="font-display mt-6 text-[clamp(5.5rem,11vw,8.5rem)] leading-[0.9] tabular">
                  {usd(EXAMPLE.settled)}
                </p>
                <p className="mt-3 text-[0.9375rem] font-medium">Net settlement</p>
                <div aria-hidden="true" className="mt-auto pt-8">
                  <div className="h-3 rounded-full bg-paper/20">
                    <GrowBar scale={netShare} delay={0.15} className="h-full w-full rounded-full bg-signal" />
                  </div>
                </div>
              </div>
            </div>

            <figcaption className="mx-auto mt-8 max-w-2xl text-center text-[0.8125rem] leading-relaxed text-paper/70">
              The arithmetic here is a simplified illustration. Whether real
              obligations can be netted depends on the agreements between
              participants and on applicable law. Not all obligations can be.
            </figcaption>
          </figure>
        </Reveal>
      </Container>
    </section>
  );
}
