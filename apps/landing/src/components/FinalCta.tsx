import Image from "next/image";
import { links, repoLinks } from "@/lib/site";
import { Parallax, Reveal } from "./Reveal";
import { ButtonLink, Container, Section } from "./ui";

/**
 * Closing card (Ondo's newsletter card): the full width of the content column and tall
 * (at least 40rem on desktop), 24px radius, a street photograph as its cover under a 60%
 * tint (the sky behind the text is near white, and the white headline needs it), the
 * second line of the h3 at 80% white. No email field: two buttons instead.
 */
export function FinalCta() {
  return (
    <Section labelledBy="cta-title" tone="light" className="!pb-0">
      <Container>
        <Reveal from="scale">
          <div
            data-surface="dark"
            className="relative isolate flex min-h-[28rem] flex-col items-center justify-center overflow-hidden rounded-card px-6 py-[120px] text-center text-paper sm:min-h-[36rem] md:px-12 lg:min-h-[clamp(40rem,78vh,50rem)]"
          >
            <Parallax distance={50} className="absolute -inset-y-16 inset-x-0 -z-10">
              <Image
                src="/cta/cta-street.jpg"
                alt=""
                fill
                sizes="(min-width: 1536px) 1440px, 100vw"
                className="object-cover object-center"
              />
            </Parallax>
            <div aria-hidden="true" className="absolute inset-0 -z-10 bg-ink-soft/60" />
            <h2 id="cta-title" className="t-h3 mx-auto max-w-[22ch] text-balance">
              Inspect the protocol, run <span className="whitespace-nowrap">MVP-1</span>,
              <span className="block text-paper/80">or tell us where it breaks.</span>
            </h2>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {links.github ? (
                <ButtonLink href={links.github} variant="light">
                  View on GitHub
                </ButtonLink>
              ) : null}
              <ButtonLink href={repoLinks.contributing} variant="glass">
                How to give feedback
              </ButtonLink>
              {links.docs ? (
                <ButtonLink href={links.docs} variant="glass">
                  Documentation
                </ButtonLink>
              ) : null}
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
