import { HowScene } from "./HowScene";

/**
 * One scene for every viewport. Where there is room (wide, tall, no
 * reduced-motion preference) it is pinned and scroll-driven; everywhere else
 * the same window simply sits in the flow with its whole log visible.
 */
export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" data-nav-tone="dark">
      <HowScene />
    </section>
  );
}
