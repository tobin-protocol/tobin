import type { ReactNode } from "react";
import { NetworkStellar } from "@web3icons/react";
import { Reveal } from "./Reveal";
import { StackIllustration, type Layer } from "./StackIllustration";
import { Container, Eyebrow, Icon, Section } from "./ui";
import type { IconSvgElement } from "@hugeicons/react";
import { Orbit01Icon, SourceCodeIcon, Layers01Icon, ArrowDataTransferHorizontalIcon } from "@hugeicons/core-free-icons";

/*
 * Four statements, each with the layer it talks about lit in the picture.
 * `details` keeps every label and description from the architecture diagram.
 */
const ROWS: {
  n: string;
  term: string;
  sentence: string;
  layer: Layer;
  details: [string, string][];
  icon: IconSvgElement;
  /** A ready-made mark that replaces the line icon (the Stellar network logo). */
  mark?: ReactNode;
}[] = [
  {
    n: "01",
    term: "Stellar",
    sentence: "Stellar provides the settlement network.",
    layer: "stellar",
    details: [["Stellar network", "The settlement network"]],
    icon: Orbit01Icon,
    mark: <NetworkStellar variant="mono" size={24} color="currentColor" aria-hidden="true" />,
  },
  {
    n: "02",
    term: "Soroban",
    sentence: "Soroban supports Tobin's on-chain protocol logic.",
    layer: "soroban",
    details: [["Soroban", "Smart contracts holding Tobin's on-chain protocol logic"]],
    icon: SourceCodeIcon,
  },
  {
    n: "03",
    term: "Tobin",
    sentence: "Tobin adds a clearing layer above existing payment infrastructure.",
    layer: "tobin",
    details: [
      ["Tobin clearing layer", "Obligations, clearing sessions, net positions"],
      ["Institutions and integrators", "Submit obligations and receive net positions"],
    ],
    icon: Layers01Icon,
  },
  {
    n: "04",
    term: "SEP-31",
    sentence: "SEP-31 stays in place. Tobin is designed to complement it, not replace it.",
    layer: "sep31",
    details: [["Existing standard", "Cross-border payments. Unchanged, and complemented by Tobin."]],
    icon: ArrowDataTransferHorizontalIcon,
  },
];

/**
 * Built for Stellar: Ondo's section-heading pattern (the second phrase in grey-500)
 * over four white 24px-radius cards, each a 48px black icon tile, a mono number, a
 * large title and its sentence, with the isometric stack beside it and the relevant
 * layer lit.
 */
export function Stellar() {
  return (
    <Section id="stellar" labelledBy="stellar-title" tone="grey">
      <Container>
        <Reveal>
          <Eyebrow>Built for Stellar</Eyebrow>
          <h2 id="stellar-title" className="t-h3 mt-6 max-w-[30ch] text-balance">
            A clearing layer
            <span className="block text-grey-500">above the rails that already exist.</span>
          </h2>
        </Reveal>

        <div className="mt-12 flex flex-col gap-4 md:mt-16">
          {ROWS.map((r, i) => (
            <Reveal key={r.term} from={i % 2 ? "right" : "left"}>
              <div className="grid items-center gap-8 rounded-card bg-paper p-6 md:grid-cols-2 md:gap-16 md:p-10">
                <div>
                  <div className="flex items-center gap-4">
                    <span className="tile">
                      {r.mark ?? <Icon icon={r.icon} />}
                    </span>
                    <span className="t-mono text-grey-600">{r.n}</span>
                  </div>
                  <h3 className="t-h4 mt-6">{r.term}</h3>
                  <p className="t-lead mt-4 max-w-[28rem] text-grey-850">{r.sentence}</p>
                  <dl className="rule-top mt-8 max-w-[28rem] space-y-3 pt-5">
                    {r.details.map(([k, v]) => (
                      <div key={k}>
                        <dt className="t-label text-grey-600">{k}</dt>
                        <dd className="t-serif mt-1 text-[0.9375rem] text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="flex justify-center md:justify-end">
                  <StackIllustration active={r.layer} />
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <p className="t-label mt-6 text-grey-600">Simplified architecture for illustration.</p>
      </Container>
    </Section>
  );
}
