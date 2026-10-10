import { FinalCta } from "@/components/FinalCta";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { Nav } from "@/components/Nav";
import { Principles } from "@/components/Principles";
import { Problem } from "@/components/Problem";
import { Stellar } from "@/components/Stellar";

export default function Home() {
  return (
    <div id="top" className="flex flex-1 flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:text-sm focus:font-medium focus:text-paper"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main" className="relative flex-1">
        <Hero />
        {/* Ink curtain: rises over the pinned hero, with a diagonal top edge. */}
        <div
          data-surface="dark"
          data-nav-tone="dark"
          className="seam pin-curtain relative z-10 bg-navy text-paper"
        >
          <Problem />
          <HowItWorks />
        </div>
        <Stellar />
        <Principles />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
