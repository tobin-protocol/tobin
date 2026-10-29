import { ClearingShowcase } from "./ClearingShowcase";
import { LineReveal, Reveal } from "./Reveal";
import { Container, Eyebrow, Section } from "./ui";

/**
 * The problem, in the README's own terms: the statement, two paragraphs, then the
 * illustrative example as an Ondo-style showcase (cards on the left, charts on the right).
 * Every figure comes from lib/clearing.ts.
 */
export function Problem() {
  return (
    <Section id="protocol" labelledBy="problem-title" tone="light">
      <Container>
        <Eyebrow>The problem</Eyebrow>
        <h2 id="problem-title" className="t-h2 mt-6 max-w-[20ch] text-balance">
          <LineReveal
            lines={[
              "Fast settlement does not",
              { text: "remove the need for clearing.", className: "text-grey-500" },
            ]}
          />
        </h2>

        <div className="mt-10 grid gap-6 md:mt-14 md:grid-cols-2 md:gap-12">
          <Reveal>
            <p className="t-lead text-grey-850">
              When institutions owe each other in several directions, settling each obligation on
              its own can move far more gross value than the final net positions need.
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="t-lead">
              SEP-31 gives two anchors a common way to carry a payment, but it does not define an
              open, network-level way to aggregate obligations from many institutions and settle
              only the net.
            </p>
          </Reveal>
        </div>

        <Reveal className="mt-16 md:mt-24">
          <ClearingShowcase />
        </Reveal>

        <p className="t-body mx-auto mt-12 max-w-[40rem] md:mt-16">
          Whether real Stellar payment flows are connected enough for clearing to reduce gross
          settlement has not been measured yet.
        </p>
      </Container>
    </Section>
  );
}
