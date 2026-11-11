import { Reveal } from "./Reveal";
import { Container, Eyebrow, Section } from "./ui";

/** The development-status ledger: what is built, what is proven, what is next. */
const ROWS: { label: string; value: string; detail: string }[] = [
  {
    label: "Built",
    value: "A working institutional clearing application, its contracts and an open-source SDK.",
    detail:
      "Organizations and roles, obligations, deterministic netting, calculation approval and settlement batch preparation, deployed as a hosted web application and API, with a Soroban clearing contract and the netting engine in the repository under Apache-2.0.",
  },
  {
    label: "Proven on Testnet",
    value: "The settlement path runs on Stellar.",
    detail:
      "Automated tests in the Soroban test host, and an owner-run Stellar Testnet execution of eight transactions with multisig co-signing, read back from the network and compared with the approved plan. The verification record is public in the repository. The evidence so far comes from the implementing team.",
  },
  {
    label: "Next",
    value: "Signing, submission and reconciliation from the hosted application.",
    detail:
      "Connecting an approved settlement batch to Stellar signing and independent reconciliation, followed by the broader protocol design: deadlines, abort, default and recovery handling, collateral, Merkle commitments, and a public SDK and CLI.",
  },
  {
    label: "To validate",
    value: "How much gross settlement multilateral clearing removes on real Stellar payment flows.",
    detail:
      "The first planned step uses historical Stellar ledger data and ends in an explicit go, modify or stop decision. The built milestones tested the clearing mechanics; this analysis tests the economics.",
  },
  {
    label: "Review",
    value: "An independent security review is planned before any production use.",
    detail:
      "The protocol specification (M0) is a published draft. The code, tests and reviews so far are the team's own; no independent audit has been performed and production deployment has not been approved.",
  },
];

/**
 * Status. Ledger rows (label left in serif, value right, 1px rules).
 */
export function StatusLedger() {
  return (
    <Section id="milestones" labelledBy="ledger-title" tone="grey">
      <Container>
        <Reveal>
          <Eyebrow>Status</Eyebrow>
          <h2 id="ledger-title" className="t-h3 mt-6 max-w-[22ch] text-balance">
            Where the project stands.
          </h2>
        </Reveal>

        {/* The Reveal div is itself the row that holds each dt and dd: a dl may only contain a div
            wrapper directly around its dt/dd pairs, so there is no extra wrapper in between. */}
        <dl className="mt-12 md:mt-16">
          {ROWS.map((r, i) => (
            <Reveal
              key={r.label}
              delay={i * 0.06}
              from={i % 2 ? "right" : "left"}
              className="rule-top grid gap-3 py-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-12"
            >
              <dt className="t-serif text-2xl text-grey-600">{r.label}</dt>
              <dd>
                <p className="text-[1.25rem] font-medium leading-snug tracking-[-0.01em]">{r.value}</p>
                <p className="t-serif mt-2 max-w-[44rem] text-base text-grey-600">{r.detail}</p>
              </dd>
            </Reveal>
          ))}
        </dl>

      </Container>
    </Section>
  );
}
