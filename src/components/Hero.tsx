import { links } from "@/lib/site";
import { ClearingVisual } from "./ClearingVisual";
import { Reveal } from "./Reveal";
import { ButtonLink, Container } from "./ui";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="pb-20 pt-10 sm:pt-16 md:pb-28 lg:pt-20">
      <Container className="grid items-center gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12">
        <div>
          <Reveal>
            <p className="eyebrow">Open clearing protocol for Stellar</p>
          </Reveal>
          <Reveal delay={0.06}>
            <h1 id="hero-title" className="text-display mt-6">
              <span className="block">Clear more.</span>
              <span className="block text-ink-faint">Settle less.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="text-lead mt-7 max-w-[30rem]">
              Tobin is an open clearing protocol that helps financial
              institutions net payment obligations and settle the resulting
              balances on Stellar.
            </p>
          </Reveal>
          <Reveal delay={0.18}>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="#how-it-works">Explore How It Works</ButtonLink>
              <ButtonLink href={links.docs ?? "#protocol"} variant="secondary">
                Read the Protocol
              </ButtonLink>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.1} className="mx-auto w-full max-w-[30rem] lg:max-w-none">
          <ClearingVisual />
        </Reveal>
      </Container>
    </section>
  );
}
