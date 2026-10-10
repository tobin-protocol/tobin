import { PrincipleBlocks } from "./PrincipleBlocks";
import { Reveal } from "./Reveal";
import { Container } from "./ui";

const blocks = [
  {
    title: "Open infrastructure",
    body: "An open protocol designed for use by multiple institutions and integrators, rather than a single operator.",
    surface: "accent",
    className: "bg-accent text-paper",
    fg: "var(--color-paper)",
  },
  {
    title: "Verifiable clearing",
    body: "Clearing is deterministic: the same inputs produce the same net positions. Cryptographic commitments and participant authorization are part of the protocol design.",
    surface: "dark",
    className: "bg-navy text-paper",
    fg: "var(--color-accent-bright)",
  },
  {
    title: "Capital efficiency",
    body: "Designed to reduce unnecessary gross settlement where eligible obligations can be netted.",
    surface: "signal",
    className: "bg-signal text-ink",
    fg: "var(--color-ink)",
  },
] as const;

export function Principles() {
  return (
    <section id="protocol" aria-labelledby="principles-title" className="pt-24 md:pt-32">
      <Container>
        <Reveal>
          <p className="eyebrow">Protocol principles</p>
          {/* One straight line from md up, scaled to span the container (like Stellar's). */}
          <h2
            id="principles-title"
            className="font-display mt-5 text-[clamp(2.75rem,11vw,5rem)] uppercase leading-[0.95] text-balance md:whitespace-nowrap md:text-[min(6.5rem,calc((100vw-4rem)/10.9))]"
          >
            Three ideas the protocol is built around.
          </h2>
        </Reveal>
      </Container>

      <PrincipleBlocks blocks={[...blocks]} />

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
