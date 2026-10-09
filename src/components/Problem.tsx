import { EXAMPLE, EXAMPLE_OBLIGATIONS, usd } from "@/lib/clearing";
import { GrowBar, Reveal } from "./Reveal";
import { Container } from "./ui";

const netShare = EXAMPLE.settled / EXAMPLE.gross;

export function Problem() {
  return (
    <section id="problem" aria-labelledby="problem-title" className="py-28 md:py-40">
      <Container className="grid gap-14 lg:grid-cols-12 lg:gap-10">
        <Reveal className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <p className="eyebrow">The problem</p>
            <h2 id="problem-title" className="text-title mt-4 text-balance">
              Not every payment needs to settle individually.
            </h2>
            <p className="text-lead mt-5 max-w-[32rem]">
              When institutions owe one another money, settling every
              obligation separately can create unnecessary settlement volume.
              Each extra payment adds operational work, even when the
              obligations largely offset each other.
            </p>
            <p className="text-body mt-4 max-w-[32rem]">
              Clearing looks at the whole picture first, then settles only what
              is left.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.08} className="lg:col-span-7">
          <figure className="rounded-[1.75rem] border border-line bg-surface p-5 text-ink shadow-card sm:p-8">
            <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <span className="rounded-full bg-accent-tint px-3 py-1.5 text-xs font-semibold text-accent-ink">
                Illustrative example
              </span>
              <span className="text-[0.8125rem] text-ink-soft">
                Not real transaction data
              </span>
            </figcaption>

            <div className="mt-7 grid gap-8 sm:grid-cols-2 sm:gap-0">
              <div className="sm:pr-8">
                <h3 className="text-[0.8125rem] font-semibold text-ink-soft">
                  Settled one by one
                </h3>
                <ul className="mt-4 divide-y divide-line border-y border-line">
                  {EXAMPLE_OBLIGATIONS.map((o) => (
                    <li key={o.from} className="flex items-baseline justify-between py-3.5">
                      <span className="text-[1.0625rem] font-medium tracking-[-0.01em]">
                        <span aria-hidden="true">
                          {o.from} → {o.to}
                        </span>
                        <span className="sr-only">
                          {o.from} owes {o.to}
                        </span>
                      </span>
                      <span className="tabular text-[1.0625rem] font-semibold">{usd(o.amount)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 flex items-baseline justify-between">
                  <span className="text-sm text-ink-soft">Gross settlement</span>
                  <span className="tabular text-2xl font-semibold tracking-[-0.03em]">{usd(EXAMPLE.gross)}</span>
                </p>
              </div>

              <div className="sm:border-l sm:border-line sm:pl-8">
                <h3 className="text-[0.8125rem] font-semibold text-ink-soft">
                  After clearing: net positions
                </h3>
                <ul className="mt-4 divide-y divide-line border-y border-line">
                  {EXAMPLE.positions.map((p) => (
                    <li key={p.party} className="py-3.5">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[1.0625rem] font-medium tracking-[-0.01em]">
                          {p.party} {p.net < 0 ? "pays" : "receives"}
                        </span>
                        <span className={`tabular text-[1.0625rem] font-semibold ${p.net < 0 ? "" : "text-accent"}`}>
                          {usd(Math.abs(p.net))}
                        </span>
                      </div>
                      <p className="tabular mt-0.5 text-[0.8125rem] text-ink-soft">
                        owes {usd(p.owes)}, is owed {usd(p.owed)}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 flex items-baseline justify-between">
                  <span className="text-sm text-ink-soft">Net settlement</span>
                  <span className="tabular text-2xl font-semibold tracking-[-0.03em] text-accent">{usd(EXAMPLE.settled)}</span>
                </p>
              </div>
            </div>

            <div className="mt-9 space-y-3" role="img" aria-label={`Bar comparison: ${usd(EXAMPLE.gross)} gross versus ${usd(EXAMPLE.settled)} net, in this example.`}>
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

            <p className="mt-7 border-t border-line pt-5 text-[0.8125rem] leading-relaxed text-ink-soft">
              The arithmetic here is a simplified illustration. Whether real
              obligations can be netted depends on the agreements between
              participants and on applicable law. Not all obligations can be.
            </p>
          </figure>
        </Reveal>
      </Container>
    </section>
  );
}
