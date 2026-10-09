import { Reveal } from "./Reveal";
import { Container } from "./ui";

const principles = [
  {
    title: "Open infrastructure",
    body: "An open protocol designed for use by multiple institutions and integrators, rather than a single operator.",
  },
  {
    title: "Verifiable clearing",
    body: "Clearing is deterministic: the same inputs produce the same net positions. Cryptographic commitments and participant authorization are part of the protocol design.",
  },
  {
    title: "Capital efficiency",
    body: "Designed to reduce unnecessary gross settlement where eligible obligations can be netted.",
  },
];

export function Principles() {
  return (
    <section id="protocol" aria-labelledby="principles-title" className="border-t border-line py-24 md:py-32">
      <Container>
        <Reveal>
          <p className="eyebrow">Protocol principles</p>
          <h2 id="principles-title" className="text-title mt-4 max-w-[34rem] text-balance">
            Three ideas the protocol is built around.
          </h2>
        </Reveal>

        <ol className="mt-14 grid gap-10 md:mt-20 md:grid-cols-3 md:gap-0">
          {principles.map((p, i) => (
            <li
              key={p.title}
              className="border-t border-line-strong pt-6 md:border-t-0 md:border-l md:px-8 md:pt-1 md:first:border-l-0 md:first:pl-0"
            >
              <Reveal delay={i * 0.08}>
                <p className="tabular font-mono text-xs tracking-[0.04em] text-ink-faint">0{i + 1}</p>
                <h3 className="text-heading mt-3">{p.title}</h3>
                <p className="text-body mt-3 max-w-[22rem]">{p.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>

        <Reveal delay={0.1}>
          <p className="mt-16 max-w-[40rem] border-t border-line pt-6 text-[0.875rem] leading-relaxed text-ink-soft md:mt-20">
            Tobin is an open protocol under development. Nothing on this page
            describes a live production network, completed audits, institutional
            adoption, or measured savings.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
