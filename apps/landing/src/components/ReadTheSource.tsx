import { sourceCards } from "@/lib/site";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { Reveal } from "./Reveal";
import { Container, Eyebrow, Section } from "./ui";

/**
 * Bento layout for the source cards: on desktop a 4-column grid in which the README is a
 * large dark tile (2x2), the contracts and the ABI reference are wide tiles (2x1) and
 * the rest are single tiles, so three rows fill the grid exactly. Below 768px it is one
 * column. Tones alternate between ink, ink-soft, grey-100 and outlined white.
 *
 * Each tile is a link to a file that exists in the protocol repository (opened in a new
 * tab): a mono path, the kind and licence, a title and one line. Hover dips the opacity.
 */
const TILES: { span: string; tone: string; soft: string; big?: boolean }[] = [
  { span: "md:col-span-2 md:row-span-2", tone: "bg-ink text-paper", soft: "text-grey-400", big: true },
  { span: "md:col-span-2", tone: "bg-grey-100 text-ink", soft: "text-grey-600" },
  { span: "", tone: "border border-grey-200 bg-paper text-ink", soft: "text-grey-600" },
  { span: "", tone: "bg-ink-soft text-paper", soft: "text-grey-400" },
  { span: "md:col-span-2", tone: "bg-grey-100 text-ink", soft: "text-grey-600" },
  { span: "", tone: "bg-ink-soft text-paper", soft: "text-grey-400" },
  { span: "", tone: "border border-grey-200 bg-paper text-ink", soft: "text-grey-600" },
];

export function ReadTheSource() {
  return (
    <Section id="source" labelledBy="source-title" tone="light">
      <Container>
        <Reveal>
          <Eyebrow>Read the source</Eyebrow>
          <h2 id="source-title" className="t-h3 mt-6 max-w-[20ch] text-balance">
            Everything here is in the repository.
          </h2>
        </Reveal>

        <ul className="mt-12 grid auto-rows-[minmax(20rem,auto)] gap-3 md:mt-16 md:grid-cols-4">
          {sourceCards.map((c, i) => {
            const t = TILES[i];
            return (
              <li key={c.path} className={t.span}>
                <Reveal delay={(i % 3) * 0.08} from={i === 0 ? "left" : i % 2 ? "scale" : "right"} className="h-full">
                  <a
                    href={c.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-surface={t.tone.includes("bg-ink") ? "dark" : undefined}
                    className={`flex h-full min-h-80 flex-col justify-between gap-4 overflow-hidden rounded-card p-6 hover:opacity-90 md:p-8 ${t.tone}`}
                  >
                    <span className="flex items-start justify-between gap-4">
                      <span className={`t-mono ${t.soft}`}>{c.path}</span>
                      <HugeiconsIcon icon={ArrowUpRight01Icon} size={22} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
                    </span>
                    <span>
                      <span className={`block text-[0.875rem] ${t.soft}`}>{c.kind} • Apache-2.0</span>
                      <span
                        className={`mt-2 block font-medium leading-[1.05] tracking-[-0.02em] ${t.big ? "text-[clamp(2rem,4vw,3.5rem)]" : "text-[1.5rem]"}`}
                      >
                        {c.title}
                        <span className="sr-only"> (opens in a new tab)</span>
                      </span>
                      <span className={`t-serif mt-3 block text-base ${t.soft}`}>{c.body}</span>
                    </span>
                  </a>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </Container>
    </Section>
  );
}
