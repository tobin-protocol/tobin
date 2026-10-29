import { BuiltStatus } from "@/components/BuiltStatus";
import { FinalCta } from "@/components/FinalCta";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { Manifesto } from "@/components/Manifesto";
import { Nav } from "@/components/Nav";
import { NettingArc } from "@/components/NettingArc";
import { Problem } from "@/components/Problem";
import { ReadTheSource } from "@/components/ReadTheSource";
import { StatusBar } from "@/components/StatusBar";
import { StatusLedger } from "@/components/StatusLedger";
import { Stellar } from "@/components/Stellar";
import { Trust } from "@/components/Trust";

export default function Home() {
  // overflow-x: clip (not hidden, so sticky still works): slide-in entrances start off to the side and must not widen the page on phones.
  return (
    <div id="top" className="relative flex flex-1 flex-col overflow-x-clip">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[1000] focus:rounded-btn focus:bg-paper focus:px-5 focus:py-3 focus:text-sm focus:font-medium focus:text-ink"
      >
        Skip to content
      </a>
      <StatusBar />
      <Nav />
      <main id="main" className="relative flex-1">
        <Hero />
        <Problem />
        <HowItWorks />
        <BuiltStatus />
        <Stellar />
        <Manifesto />
        <Trust />
        <NettingArc />
        <StatusLedger />
        <ReadTheSource />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
