import { links } from "@/lib/site";
import { HeroRibbon } from "./HeroRibbon";
import { HeroStage } from "./HeroStage";
import { Reveal } from "./Reveal";
import { ButtonLink, Container } from "./ui";

/**
 * Poster hero: a saturated field, a giant two-line headline, a kinetic ribbon
 * behind it and a hand-cut sticker. The supporting copy sits small against the
 * type, the way a poster would. The clearing diagram lives in the How It Works
 * scene, where it has room.
 */
export function Hero() {
  return (
    <HeroStage labelledBy="hero-title">
      <div className="pointer-events-none absolute inset-0 z-0">
        <HeroRibbon />
      </div>

      <Container className="relative z-10 w-full">
        {/* One sentence for assistive tech; the pieces below are display only. */}
        <p className="sr-only">Open clearing protocol for Stellar</p>
        <Reveal>
          <p aria-hidden="true" className="font-display text-[clamp(1.75rem,3.2vw,3rem)] uppercase leading-none">
            Open clearing protocol
          </p>
        </Reveal>

        <div className="mt-2 grid items-end gap-8 lg:mt-3 lg:grid-cols-[auto_minmax(16rem,1fr)] lg:gap-10">
          <div>
            <Reveal delay={0.1}>
              <h1
                id="hero-title"
                className="font-display text-[min(21vw,6.25rem)] uppercase leading-[0.86] sm:text-[min(21vw,9rem)] lg:text-[clamp(4.5rem,min(11.7rem,30vh,16.3vw),11.7rem)]"
              >
                <span className="block">Clear more.</span>
                <span className="block">Settle less.</span>
              </h1>
            </Reveal>

            <Reveal delay={0.35}>
              <div aria-hidden="true" className="-mt-3 flex items-center justify-end gap-3 pr-1 sm:-mt-5 sm:gap-4">
                <span className="-rotate-[14deg] font-mono text-2xl text-paper">for</span>
                <span
                  className="-rotate-2 bg-signal px-5 py-1.5 font-display text-[clamp(2rem,4.2vw,3.75rem)] uppercase leading-none tracking-[0.04em] text-ink sm:px-7"
                  style={{ borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px" }}
                >
                  Stellar
                </span>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.5} className="lg:pb-3">
            <p className="text-lead max-w-[28rem] lg:max-w-[20rem]">
              Tobin is an open clearing protocol that helps financial
              institutions net payment obligations and settle the resulting
              balances on Stellar.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-stretch">
              <ButtonLink href="#how-it-works" variant="signal">
                Explore How It Works
              </ButtonLink>
              <ButtonLink href={links.docs ?? "#protocol"} variant="outline-light">
                Read the Protocol
              </ButtonLink>
            </div>
          </Reveal>
        </div>
      </Container>
    </HeroStage>
  );
}
