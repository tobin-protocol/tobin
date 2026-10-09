import { links } from "@/lib/site";
import { Reveal } from "./Reveal";
import { Arrow, ButtonLink, Container, PendingLink } from "./ui";

export function FinalCta() {
  return (
    <section
      aria-labelledby="cta-title"
      data-surface="dark"
      data-nav-tone="dark"
      className="seam relative flex min-h-[85vh] items-center bg-ink pb-28 pt-40 text-paper md:pb-36 md:pt-52"
    >
      <Container>
        <Reveal>
          <h2 id="cta-title" className="font-display max-w-[16ch] text-[clamp(3.5rem,9.5vw,9.5rem)] uppercase leading-[0.88] text-balance">
            Build on a better clearing layer.
          </h2>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="mt-8 max-w-[30rem] text-[1.0625rem] leading-relaxed text-paper/70 md:text-lg">
            Explore the protocol, follow development, and help shape more
            efficient institutional settlement on Stellar.
          </p>
        </Reveal>
        <Reveal delay={0.24}>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            {links.docs ? (
              <ButtonLink href={links.docs} variant="signal">
                Read the documentation
                <Arrow />
              </ButtonLink>
            ) : (
              <PendingLink>Documentation</PendingLink>
            )}
            {links.github ? (
              <ButtonLink href={links.github} variant="outline-light">
                View on GitHub
              </ButtonLink>
            ) : (
              <PendingLink>GitHub</PendingLink>
            )}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
