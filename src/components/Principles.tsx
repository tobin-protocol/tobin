import { Reveal } from "./Reveal";
import { Container } from "./ui";

/** Each principle owns a surface; `tone` drives colour, text and focus ring together. */
const principles = [
  {
    title: "Open infrastructure",
    body: "An open protocol designed for use by multiple institutions and integrators, rather than a single operator.",
    surface: "accent",
    className: "bg-accent text-paper",
  },
  {
    title: "Verifiable clearing",
    body: "Clearing is deterministic: the same inputs produce the same net positions. Cryptographic commitments and participant authorization are part of the protocol design.",
    surface: "dark",
    className: "bg-ink text-paper",
  },
  {
    title: "Capital efficiency",
    body: "Designed to reduce unnecessary gross settlement where eligible obligations can be netted.",
    surface: "signal",
    className: "bg-signal text-ink",
  },
] as const;

export function Principles() {
  return (
    <section id="protocol" aria-labelledby="principles-title" className="pt-24 md:pt-32">
      <Container>
        <Reveal>
          <p className="eyebrow">Protocol principles</p>
          <h2 id="principles-title" className="text-title mt-4 max-w-[34rem] text-balance">
            Three ideas the protocol is built around.
          </h2>
        </Reveal>
      </Container>

      {/* Full-bleed blocks, flush against each other. */}
      <ol className="mt-14 grid md:mt-20 md:grid-cols-3">
        {principles.map((p, i) => (
          <li key={p.title} data-surface={p.surface} className={`${p.className} flex`}>
            <Reveal delay={i * 0.08} className="flex min-h-[24rem] w-full flex-col justify-between p-6 sm:p-10 md:min-h-[34rem] lg:min-h-[38rem]">
              <p className="spaced tabular">0{i + 1}</p>

              <p className="text-body my-10 max-w-[22rem] text-[0.9375rem] sm:text-base">{p.body}</p>

              <h3 className="font-display text-[3.5rem] uppercase leading-[0.9] md:text-[clamp(1.75rem,6vw,5.5rem)]">
                {p.title.split(" ").map((word) => (
                  <span key={word} className="block">
                    {word}
                  </span>
                ))}
              </h3>
            </Reveal>
          </li>
        ))}
      </ol>

      <Container>
        <Reveal delay={0.1}>
          <p className="max-w-[40rem] py-14 text-[0.875rem] leading-relaxed text-ink-soft md:py-20">
            Tobin is an open protocol under development. Nothing on this page
            describes a live production network, completed audits, institutional
            adoption, or measured savings.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
