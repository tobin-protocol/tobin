import { Reveal } from "./Reveal";
import { Container, Eyebrow, Section } from "./ui";

/** The README's development-status table, in the README's own words. */
const ROWS: { label: string; value: string; detail: string }[] = [
  {
    label: "Exists today",
    value: "The repository, the implemented MVP-1.2 to MVP-1.5 workflows and this landing page.",
    detail:
      "The licence, the README, contribution guidelines, the institutional application, the contracts and SDK, and the project's landing page in apps/landing.",
  },
  {
    label: "Demonstrated on Testnet",
    value: "The settlement path, within a narrow scope.",
    detail:
      "Automated tests in the Soroban test host, and one owner-run Stellar Testnet execution of eight transactions with multisig co-signing, read back from the network and compared with the approved plan. The Testnet verification record is in the repository. The evidence is from the implementing author only; no independent review has been performed.",
  },
  {
    label: "Not yet implemented",
    value: "The rest of the broader protocol design, and production infrastructure.",
    detail:
      "Deadlines, abort, default and recovery handling, collateral, Merkle commitments, an institutional adapter and CLI packages for the broader protocol, a conformance suite, application-level reconciliation of on-chain outcomes, hardware-wallet validation and production deployment.",
  },
  {
    label: "Not yet validated",
    value:
      "Whether real Stellar institutional payment flows are interconnected enough for multilateral clearing to reduce gross settlement.",
    detail:
      "The first planned validation step uses historical Stellar ledger data and ends in an explicit go, modify or stop decision. That analysis has not been done; The implemented milestones tested the clearing mechanics, not this question.",
  },
  {
    label: "Review status",
    value: "The protocol specification (M0) exists as a draft.",
    detail:
      "It has not been approved, and it has been written and tested only by its author: no independent review, audit or fuzzing has been done.",
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
