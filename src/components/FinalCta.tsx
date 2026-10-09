import { links } from "@/lib/site";
import { Reveal } from "./Reveal";
import { Arrow, ButtonLink, Container, PendingLink } from "./ui";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="pb-16 pt-8 md:pb-24">
      <Container>
        <Reveal>
          <div className="rounded-[2rem] bg-ink px-6 py-16 text-paper sm:px-12 md:py-24">
            <h2 id="cta-title" className="text-title max-w-[28rem] text-balance">
              Build on a better clearing layer.
            </h2>
            <p className="mt-5 max-w-[30rem] text-[1.0625rem] leading-relaxed text-paper/70 md:text-lg">
              Explore the protocol, follow development, and help shape more
              efficient institutional settlement on Stellar.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              {links.docs ? (
                <ButtonLink href={links.docs} variant="light">
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
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
