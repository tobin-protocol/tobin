import { EXAMPLE, EXAMPLE_OBLIGATIONS, usd } from "@/lib/clearing";
import { GrowBar, Reveal } from "./Reveal";
import { Container } from "./ui";

const netShare = EXAMPLE.settled / EXAMPLE.gross;

type CardData = {
  label: string;
  amount: number;
  title: string;
  sub?: string;
  /** Receivers read in the loud second hue; everything else in paper. */
  receives?: boolean;
};

const grossCards: CardData[] = EXAMPLE_OBLIGATIONS.map((o) => ({
  label: "Obligation",
  amount: o.amount,
  title: `${o.from} owes ${o.to}`,
}));

const netCards: CardData[] = EXAMPLE.positions.map((p) => ({
  label: "Net position",
  amount: Math.abs(p.net),
  title: `${p.party} ${p.net < 0 ? "pays" : "receives"}`,
  sub: `owes ${usd(p.owes)}, is owed ${usd(p.owed)}`,
  receives: p.net > 0,
}));

function Card({ card, index }: { card: CardData; index: number }) {
  return (
    <div className="group mx-3 flex h-80 w-60 shrink-0 flex-col rounded-md border border-paper/15 bg-paper/[0.04] p-6 transition-all duration-700 hover:border-paper/40 hover:bg-paper/[0.08] sm:mx-4 sm:h-96 sm:w-72">
      <div className="flex items-start justify-between text-paper/60 transition-colors duration-700 group-hover:text-paper">
        <span className="spaced">{card.label}</span>
        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-paper/30 transition-colors duration-700 group-hover:bg-signal" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center">
        <span
          className={`font-display text-[5.5rem] leading-none sm:text-[7rem] ${card.receives ? "text-signal" : "text-paper"}`}
        >
          {usd(card.amount)}
        </span>
        {card.sub ? (
          <span className="tabular mt-4 font-mono text-[11px] tracking-[0.02em] text-paper/70">{card.sub}</span>
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
          <figure className="mx-auto max-w-4xl rounded-[1.75rem] bg-surface p-5 text-ink shadow-card sm:p-8">
            <div className="grid gap-8 sm:grid-cols-2 sm:gap-0">
              <div className="sm:pr-8">
                <h3 className="text-[0.8125rem] font-semibold text-ink-soft">Settled one by one</h3>
                <p className="mt-4 flex items-baseline justify-between">
                  <span className="text-sm text-ink-soft">Gross settlement</span>
                  <span className="tabular text-3xl font-semibold tracking-[-0.03em]">{usd(EXAMPLE.gross)}</span>
                </p>
              </div>
              <div className="sm:border-l sm:border-line sm:pl-8">
                <h3 className="text-[0.8125rem] font-semibold text-ink-soft">After clearing: net positions</h3>
                <p className="mt-4 flex items-baseline justify-between">
                  <span className="text-sm text-ink-soft">Net settlement</span>
                  <span className="tabular text-3xl font-semibold tracking-[-0.03em] text-accent">{usd(EXAMPLE.settled)}</span>
                </p>
              </div>
            </div>

            <div className="mt-8 space-y-3" role="img" aria-label={`Bar comparison: ${usd(EXAMPLE.gross)} gross versus ${usd(EXAMPLE.settled)} net, in this example.`}>
              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="w-12 shrink-0 text-xs font-semibold text-ink-soft">Gross</span>
                <div className="h-2.5 flex-1 rounded-full bg-ink/[0.06]">
                  <GrowBar scale={1} className="h-full w-full rounded-full bg-ink" />
                </div>
              </div>
              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="w-12 shrink-0 text-xs font-semibold text-ink-soft">Net</span>
                <div className="h-2.5 flex-1 rounded-full bg-ink/[0.06]">
                  <GrowBar scale={netShare} delay={0.15} className="h-full w-full rounded-full bg-accent" />
                </div>
              </div>
            </div>

            <figcaption className="mt-7 border-t border-line pt-5 text-[0.8125rem] leading-relaxed text-ink-soft">
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
