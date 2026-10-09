import { links } from "@/lib/site";
import { ClearingVisual } from "./ClearingVisual";
import { HeroStage } from "./HeroStage";
import { Reveal } from "./Reveal";
import { ButtonLink, Container } from "./ui";

export function Hero() {
  return (
    <HeroStage labelledBy="hero-title">
      <Container className="grid w-full items-center gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12">
        <div>
          <Reveal>
            <p className="eyebrow">Open clearing protocol for Stellar</p>
          </Reveal>
          <Reveal delay={0.1}>
            <h1 id="hero-title" className="text-display-xl mt-6">
              <span className="block">Clear more.</span>
              <span className="block text-ink-faint">Settle less.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.25}>
            <p className="text-lead mt-7 max-w-[30rem]">
              Tobin is an open clearing protocol that helps financial
              institutions net payment obligations and settle the resulting
              balances on Stellar.
            </p>
          </Reveal>
          <Reveal delay={0.4}>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="#how-it-works">Explore How It Works</ButtonLink>
              <ButtonLink href={links.docs ?? "#protocol"} variant="secondary">
                Read the Protocol
              </ButtonLink>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.2} className="mx-auto w-full max-w-[30rem] lg:max-w-none">
          <ClearingVisual fit />
        </Reveal>
      </Container>
    </HeroStage>
  );
}
