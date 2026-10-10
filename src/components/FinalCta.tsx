import { links } from "@/lib/site";
import { Reveal } from "./Reveal";
import { Arrow, ButtonLink, Container, PendingLink } from "./ui";

/**
 * Closing call to action: a solid field, one giant centred headline with its
 * last words in the loud second hue, a line of copy and two pill buttons.
 */
export function FinalCta() {
  return (
    <section
      aria-labelledby="cta-title"
      data-surface="dark"
      data-nav-tone="dark"
      className="seam relative flex min-h-[90vh] items-center bg-navy pb-28 pt-40 text-center text-paper md:pb-36 md:pt-52"
    >
      <Container className="flex flex-col items-center">
        <Reveal>
          <h2
            id="cta-title"
            className="font-display text-[clamp(2.25rem,12vw,3.75rem)] uppercase leading-[0.92] md:text-[calc(min(68rem,100vw-4rem)/9.8)]"
          >
            <span className="block">Build on a better</span>
            <span className="block text-signal">clearing layer.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="mx-auto mt-9 max-w-[34rem] text-[1.0625rem] leading-relaxed text-paper/75 md:text-xl">
            Explore the protocol, follow development, and help shape more
            efficient institutional settlement on Stellar.
          </p>
        </Reveal>
        <Reveal delay={0.24}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
