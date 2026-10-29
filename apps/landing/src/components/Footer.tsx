import { links, repoLinks } from "@/lib/site";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { MaskReveal, Reveal } from "./Reveal";
import { StencilWordmark } from "./StencilWordmark";
import { Container, PendingLink } from "./ui";

type Dest = { label: string; href: string | null };

// Every destination that exists, in one row. Documentation has no URL yet, so it is a marked placeholder.
const DESTINATIONS: Dest[] = [
  ...(links.github ? [{ label: "GitHub repository", href: links.github }] : []),
  { label: "README", href: repoLinks.readme },
  { label: "Specification (draft)", href: repoLinks.spec },
  { label: "Contracts", href: repoLinks.contracts },
  { label: "Documentation", href: links.docs },
  { label: "Contributing", href: repoLinks.contributing },
  { label: "Security", href: repoLinks.security },
  { label: "Licence (Apache-2.0)", href: repoLinks.licence },
];

const linkClass =
  "inline-flex min-h-11 items-center gap-1 text-base font-medium text-grey-600 transition-colors duration-200 hover:text-ink";

/**
 * Footer in Ondo's arrangement: the legal text in a left column, the project name set huge
 * across the full width with stencil breaks in its letters, then a hairline and one bottom row
 * with the copyright and the links. Each part reveals as it scrolls into view, once: the two
 * legal paragraphs fade in and rise one after the other, the wordmark rises out of a mask, and
 * the copyright and links fade in left to right. There are no social links because the project
 * has none.
 */
export function Footer() {
  return (
    <footer className="surface-light mt-16 md:mt-24">
      <Container className="pt-16 md:pt-20">
        <div className="max-w-[40rem] space-y-5 text-[0.8125rem] leading-[1.45] text-grey-600">
          <Reveal rise={24}>
            <p>
              Tobin is an open protocol under development. Nothing on this page describes a live
              production network, completed audits, institutional adoption, or measured savings.
            </p>
          </Reveal>
          <Reveal rise={24} delay={0.12}>
            <p>
              Illustrative figures on this page are examples, not real transaction data. The code and
              documentation are licensed under Apache-2.0. The Tobin name and logo are not licensed
              under Apache-2.0 (see{" "}
              <a href={repoLinks.notice} target="_blank" rel="noopener noreferrer" className="link text-ink">
                NOTICE
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              ).
            </p>
          </Reveal>
        </div>

        <MaskReveal delay={0.1} duration={1.1} className="mt-16 md:mt-24">
          <StencilWordmark text="Tobin Protocol" className="w-full text-ink" />
        </MaskReveal>
      </Container>

      <div className="rule-top mt-10 md:mt-14">
        <Container className="flex flex-col gap-x-8 gap-y-1 py-4 md:flex-row md:flex-wrap md:items-center">
          <Reveal rise={16}>
            <p className="inline-flex min-h-11 items-center text-base font-medium text-ink">© 2026 Tobin</p>
          </Reveal>
          <ul className="flex flex-wrap gap-x-8">
            {DESTINATIONS.map((d, i) => (
              <li key={d.label}>
                <Reveal rise={16} delay={0.05 + i * 0.05}>
                  {d.href ? (
                    <a href={d.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                      {d.label}
                      <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <PendingLink>{d.label}</PendingLink>
                  )}
                </Reveal>
              </li>
            ))}
          </ul>
        </Container>
      </div>
    </footer>
  );
}
