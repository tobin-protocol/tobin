import { Curtain } from "./Curtain";
import { Reveal } from "./Reveal";
import { StackIllustration, type Layer } from "./StackIllustration";
import { Container } from "./ui";

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
}[] = [
  {
    n: "01",
    term: "Stellar",
    sentence: "Stellar provides the settlement network.",
    layer: "stellar",
    details: [["Stellar network", "The settlement network"]],
  },
  {
    n: "02",
    term: "Soroban",
    sentence: "Soroban supports Tobin's on-chain protocol logic.",
    layer: "soroban",
    details: [["Soroban", "Smart contracts holding Tobin's on-chain protocol logic"]],
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
  },
  {
    n: "04",
    term: "SEP-31",
    sentence: "SEP-31 stays in place. Tobin is designed to complement it, not replace it.",
    layer: "sep31",
    details: [["Existing standard", "Cross-border payments. Unchanged, and complemented by Tobin."]],
  },
];

/**
 * Built for Stellar: an amber header block, then full-width split rows on ink.
 * Each row pairs a number, a large title and its sentence with an isometric
 * wireframe of the stack, alternating sides, with the relevant layer lit.
 */
export function Stellar() {
  return (
    <Curtain id="stellar" label="stellar-title" surface="signal" className="pt-24 md:pt-32">
      <Container>
        <Reveal className="pb-16 md:pb-24">
          <p className="eyebrow">+ Built for Stellar</p>
          <h2
            id="stellar-title"
            className="font-display mt-5 text-[clamp(2.75rem,11vw,4.5rem)] uppercase leading-[0.95] text-balance md:whitespace-nowrap md:text-[min(5rem,calc((100vw-4rem)/13.6))]"
          >
            A clearing layer above the rails that already exist.
          </h2>
        </Reveal>
      </Container>

      <div data-surface="dark" data-nav-tone="dark" className="bg-navy text-paper">
        {ROWS.map((r, i) => {
          const flip = i % 2 === 1;
          return (
            <div
              key={r.term}
              className="grid border-t border-paper/40 md:min-h-[30rem] md:grid-cols-2"
            >
              <div className={`flex flex-col justify-center px-6 py-14 sm:px-10 md:px-16 md:py-20 ${flip ? "md:order-2 md:border-l md:border-paper/15" : ""}`}>
                <Reveal>
                  <p className="font-mono text-xs tracking-[0.2em] text-paper/60">{r.n}</p>
                  <h3 className="font-display mt-4 text-[clamp(3.5rem,6.5vw,6rem)] uppercase leading-[0.9]">
                    {r.term}
                  </h3>
                  <p className="mt-5 max-w-[28rem] text-[1.0625rem] leading-relaxed text-paper/75 md:text-lg">
                    {r.sentence}
                  </p>
                  <dl className="mt-8 max-w-[28rem] space-y-3 border-t border-paper/15 pt-5">
                    {r.details.map(([k, v]) => (
                      <div key={k}>
                        <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/60">{k}</dt>
                        <dd className="mt-1 text-sm leading-snug text-paper/85">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </Reveal>
              </div>

              <div
                className={`flex items-center justify-center border-t border-paper/15 bg-black/30 px-6 py-12 sm:px-10 md:border-t-0 md:px-12 ${flip ? "md:order-1" : "md:border-l md:border-paper/15"}`}
              >
                <Reveal className="w-full max-w-[34rem]">
                  <StackIllustration active={r.layer} />
                </Reveal>
              </div>
            </div>
          );
        })}

        <p className="border-t border-paper/40 px-6 py-6 font-mono text-[11px] uppercase tracking-[0.18em] text-paper/60 sm:px-10 md:px-16">
          Simplified architecture for illustration.
        </p>
      </div>
    </Curtain>
  );
}
