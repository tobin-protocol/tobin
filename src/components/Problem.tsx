import { EXAMPLE, EXAMPLE_OBLIGATIONS, usd } from "@/lib/clearing";
import { Accordion, type Item } from "./ProblemAccordion";
import { GrowBar, Reveal } from "./Reveal";
import { Container } from "./ui";

const netShare = EXAMPLE.settled / EXAMPLE.gross;

const grossItems: Item[] = EXAMPLE_OBLIGATIONS.map((o) => ({
  label: "Obligation",
  amount: o.amount,
  title: `${o.from} owes ${o.to}`,
  parties: [o.from, o.to],
}));

const netItems: Item[] = EXAMPLE.positions.map((p) => ({
  label: "Net position",
  amount: Math.abs(p.net),
  title: `${p.party} ${p.net < 0 ? "pays" : "receives"}`,
  parties: [p.party],
  sub: `owes ${usd(p.owes)}, is owed ${usd(p.owed)}`,
  receives: p.net > 0,
}));

// Obligations first, then what is left after clearing; the second group is set apart.
const items: Item[] = [...grossItems, ...netItems.map((n, i) => ({ ...n, startsGroup: i === 0 }))];

export function Problem() {
  return (
    <section id="problem" aria-labelledby="problem-title" className="relative pb-24 pt-28 md:pb-32 md:pt-40">
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

      <Container className="mt-16 md:mt-24">
        <p className="spaced text-center text-paper/70">
          Illustrative example · Not real transaction data
        </p>

        <Reveal className="mt-8 md:mt-12">
          <Accordion
            items={items}
            label="Obligations settled one by one, then net positions after clearing"
          />
        </Reveal>
      </Container>

      <Container className="mt-6 md:mt-10">
        <Reveal>
          <figure className="mx-auto max-w-5xl">
            <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch md:gap-5">
              {/* Heavy: everything settled one by one. */}
              <div className="flex min-h-[19rem] flex-col rounded-[1.75rem] bg-signal-pastel p-7 text-ink sm:p-9">
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
              <div className="flex min-h-[19rem] flex-col rounded-[1.75rem] bg-accent p-7 text-paper sm:p-9">
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
