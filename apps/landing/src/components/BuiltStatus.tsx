"use client";

import { AnimatePresence, LazyMotion, m, useInView } from "motion/react";
import { useRef, useState, type KeyboardEvent } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  ArrowRight02Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  ComputerTerminal01Icon,
  File01Icon,
  FlashIcon,
  GitBranchIcon,
  ListViewIcon,
  Shield01Icon,
} from "@hugeicons/core-free-icons";
import { repoLinks, sourceCards } from "@/lib/site";
import { usePinned, useReduceMotion } from "@/lib/stage";
import { Reveal } from "./Reveal";
import { StatCharts } from "./StatCharts";
import { Container, Eyebrow, Icon, Section } from "./ui";

// Layout animations (groups moving to their new places when the filter changes) need the larger
// feature bundle. It is loaded lazily and only for this section; the rest of the page keeps the small one.
const loadLayoutFeatures = () => import("motion/react").then((mod) => mod.domMax);

type Status = "built" | "differs" | "not-built";

const STATUS_LABEL: Record<Status, string> = {
  built: "Built in MVP-1",
  differs: "Differs in MVP-1",
  "not-built": "Not built",
};

type Card = {
  id: string;
  title: string;
  description: string;
  status: Status;
  icon: IconSvgElement;
  /** Repository path shown on the mono line (cards that link to a file). */
  source?: string;
  href?: string;
  linkLabel?: string;
};

/** Each card and its status follow the README's own statuses. A link appears only where a real file exists. */
const CARDS: Card[] = [
  {
    id: "sessions",
    title: "Sessions and obligations",
    status: "built",
    description: "Recorded in small sessions with one test token.",
    icon: File01Icon,
    source: "contracts/README.md",
    href: repoLinks.contracts,
    linkLabel: "Read the contracts",
  },
  {
    id: "proposal",
    title: "Net settlement proposal",
    status: "built",
    description: "Deterministic net positions, computed by a TypeScript engine.",
    icon: ListViewIcon,
    source: sourceCards[2].path,
    href: sourceCards[2].href,
    linkLabel: "Read the engine notes",
  },
  {
    id: "approval",
    title: "Participant approval",
    status: "differs",
    description:
      "Every admitted participant approves a settlement proposal. The broader design needs only the participants with non-zero net positions to sign.",
    icon: CheckmarkCircle02Icon,
    source: sourceCards[4].path,
    href: sourceCards[4].href,
    linkLabel: "Read the ABI reference",
  },
  {
    id: "settlement",
    title: "Atomic settlement",
    status: "built",
    description:
      "Net amounts of the test token moved in one settlement on a Soroban contract, in a Stellar public-testnet run with disposable accounts.",
    icon: FlashIcon,
    source: "contracts/README.md",
    href: repoLinks.contracts,
    linkLabel: "Read the MVP-1 notes",
  },
  {
    id: "collateral",
    title: "Collateral",
    status: "not-built",
    description: "Designed to limit the exposure that can enter a session. Not in MVP-1.",
    icon: Shield01Icon,
  },
  {
    id: "merkle",
    title: "Merkle commitments",
    status: "not-built",
    description: "Designed so the chain holds commitments, not an obligation book. Not in MVP-1.",
    icon: GitBranchIcon,
  },
  {
    id: "deadlines",
    title: "Deadlines, abort, default and recovery",
    status: "not-built",
    description: "Not in MVP-1.",
    icon: Clock01Icon,
  },
  {
    id: "adapter",
    title: "Institutional adapter, SDK and CLI for the full protocol",
    status: "not-built",
    description: "Not built. No packages are published; only the experimental MVP-1 SDK source exists.",
    icon: ComputerTerminal01Icon,
  },
];

type FilterId = "all" | "built" | "not-built";

/** The two groups. "Built in MVP-1" includes the card that differs from the broader design. */
const GROUPS: { id: Exclude<FilterId, "all">; label: string; has: (s: Status) => boolean }[] = [
  { id: "built", label: "Built in MVP-1", has: (s) => s === "built" || s === "differs" },
  { id: "not-built", label: "Not built", has: (s) => s === "not-built" },
];

const count = (has: (s: Status) => boolean) => CARDS.filter((c) => has(c.status)).length;
const COUNTS = {
  built: CARDS.filter((c) => c.status === "built").length,
  differs: CARDS.filter((c) => c.status === "differs").length,
  notBuilt: CARDS.filter((c) => c.status === "not-built").length,
};

const FILTERS: { id: FilterId; label: string; n: number }[] = [
  { id: "all", label: "All", n: CARDS.length },
  ...GROUPS.map((g) => ({ id: g.id, label: g.label, n: count(g.has) })),
];

const EASE = [0.4, 0, 0.2, 1] as const;
const SQ = 9;

/**
 * The status square: filled (built), half filled along the diagonal (differs) or empty with a
 * grey outline (not built). Decorative: the status is always also written out as text.
 */
function Mark({ status }: { status: Status }) {
  return (
    <svg viewBox={`0 0 ${SQ} ${SQ}`} width={SQ} height={SQ} aria-hidden="true" className="shrink-0">
      {status === "built" ? <rect x="0" y="0" width={SQ} height={SQ} rx="2" className="fill-ink" /> : null}
      {status === "differs" ? (
        <>
          <rect x="0.5" y="0.5" width={SQ - 1} height={SQ - 1} rx="1.5" className="fill-paper stroke-ink" strokeWidth="1" />
          <polygon points={`0.5,0.5 ${SQ - 0.5},0.5 0.5,${SQ - 0.5}`} className="fill-ink" />
        </>
      ) : null}
      {status === "not-built" ? (
        <rect x="0.5" y="0.5" width={SQ - 1} height={SQ - 1} rx="1.5" className="fill-none stroke-grey-600" strokeWidth="1" />
      ) : null}
    </svg>
  );
}

/** The status marker in a card's corner: the square, then the label in small uppercase mono. */
function StatusMark({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center gap-2 ${status === "not-built" ? "text-grey-600" : "text-ink"}`}>
      <Mark status={status} />
      <span className="t-mono whitespace-nowrap uppercase tracking-[0.08em]">{STATUS_LABEL[status]}</span>
    </span>
  );
}

/** A quiet text link with an arrow that moves 4px on hover. External, so it opens in a new tab. */
function TextLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group mt-auto inline-flex min-h-11 items-center gap-2 self-start text-base font-medium text-ink hover:underline"
    >
      {children}
      <HugeiconsIcon
        icon={ArrowRight02Icon}
        size={16}
        strokeWidth={1.5}
        aria-hidden="true"
        className="shrink-0 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none"
      />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function CardView({ c }: { c: Card }) {
  const notBuilt = c.status === "not-built";
  return (
    <li
      className={`flex flex-col gap-4 rounded-card p-5 sm:p-6 ${
        notBuilt
          ? "border border-dashed border-grey-200 bg-grey-100 text-grey-600"
          : "border border-transparent bg-paper text-ink transition-colors duration-200 hover:border-grey-200"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        {notBuilt ? (
          <span className="inline-flex size-12 flex-none items-center justify-center rounded-btn border border-grey-600 text-grey-600">
            <Icon icon={c.icon} />
          </span>
        ) : (
          <span className="tile">
            <Icon icon={c.icon} />
          </span>
        )}
        <StatusMark status={c.status} />
      </div>
      <h4 className="text-[1.75rem] font-medium leading-[1.05] tracking-[-0.02em]">{c.title}</h4>
      <p className={`t-serif text-base ${notBuilt ? "text-grey-600" : "text-grey-850"}`}>{c.description}</p>
      {c.source ? <p className="t-mono text-grey-600">{c.source}</p> : null}
      {c.href && c.linkLabel ? <TextLink href={c.href}>{c.linkLabel}</TextLink> : null}
    </li>
  );
}

/**
 * Intended versus built. A header row (the section heading and a segmented filter, sticky under
 * the nav on pinned layouts), a one-line summary with a square per card, then a light shell holding
 * the cards in two groups. Built cards are solid white with a link; not-built cards are dashed
 * grey with no link, so the difference reads without reading. Counts, group headings, the
 * summary line and the filter labels all come from the one CARDS list.
 */
export function BuiltStatus() {
  const pinned = usePinned();
  const reduce = useReduceMotion();
  const [filter, setFilter] = useState<FilterId>("all");
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const summary = useRef<HTMLDivElement>(null);
  const summaryIn = useInView(summary, { once: true, amount: 0.8 });

  const onKey = (e: KeyboardEvent, i: number) => {
    const last = FILTERS.length - 1;
    let next = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = i === last ? 0 : i + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = i === 0 ? last : i - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return;
    e.preventDefault();
    setFilter(FILTERS[next].id);
    buttons.current[next]?.focus();
  };

  const visible = GROUPS.filter((g) => filter === "all" || filter === g.id);
  const move = reduce ? { duration: 0 } : { duration: 0.3, ease: EASE };

  return (
    <Section id="status" labelledBy="status-title" tone="light">
      <Container>
        <Reveal>
        <Eyebrow>Intended versus built</Eyebrow>
        <p className="t-lead mt-6 max-w-[40rem] text-grey-850">
          MVP-1 is an experimental validation milestone: small sessions, one test token, a Stellar
          public-testnet run with disposable accounts. It is not production-ready and not
          independently audited.
        </p>
        </Reveal>

        <Reveal className="mt-12" from="scale">
          <StatCharts />
        </Reveal>

        {/* Header row: sticky under the nav on pinned layouts, on a white ground so cards never show through. */}
        <div
          className={`z-20 mt-16 flex flex-col gap-4 bg-paper py-3 md:flex-row md:items-center md:justify-between md:gap-6 ${pinned ? "sticky top-[82px]" : ""}`}
        >
          <h2 id="status-title" className="t-h3">
            What exists today.
          </h2>
          <div
            role="group"
            aria-label="Filter by status"
            className="flex w-full flex-wrap gap-1 rounded-btn bg-ink-soft/5 p-2 md:w-auto md:flex-nowrap"
          >
            {FILTERS.map((f, i) => {
              const on = f.id === filter;
              return (
                <button
                  key={f.id}
                  ref={(el) => {
                    buttons.current[i] = el;
                  }}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(f.id)}
                  onKeyDown={(e) => onKey(e, i)}
                  className={`t-ui inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-btn px-4 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-ink md:flex-none ${on ? "bg-paper text-ink" : "text-grey-600 hover:text-ink"}`}
                >
                  {f.label}
                  <span className="t-mono">{f.n}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary: counts as text, then one square per card in data order. */}
        <div ref={summary} className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <p className="t-mono uppercase tracking-[0.08em] text-grey-600">
            {COUNTS.built} built · {COUNTS.differs} differs · {COUNTS.notBuilt} not built
          </p>
          <div aria-hidden="true" className="flex gap-1.5">
            {CARDS.map((c, i) => (
              <m.span
                key={c.id}
                className="inline-flex"
                initial={reduce ? false : { opacity: 0.12 }}
                animate={summaryIn || reduce ? { opacity: 1 } : { opacity: 0.12 }}
                transition={{ duration: 0.2, delay: i * 0.06 }}
              >
                <Mark status={c.status} />
              </m.span>
            ))}
          </div>
        </div>

        <LazyMotion features={loadLayoutFeatures}>
          <m.div
            layout
            className="mt-6 flex flex-col gap-6 rounded-shell bg-grey-100 p-2 sm:p-3"
            aria-label="Status of each part of the protocol"
            role="region"
          >
            <AnimatePresence initial={false}>
              {visible.map((g) => (
                <m.section
                  key={g.id}
                  layout
                  aria-labelledby={`status-group-${g.id}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={move}
                >
                  <h3
                    id={`status-group-${g.id}`}
                    className="t-mono mb-3 flex items-center gap-2 px-2 pt-2 uppercase tracking-[0.08em] text-grey-600"
                  >
                    {g.label}
                    <span>{count(g.has)}</span>
                  </h3>
                  <ul className="grid gap-3 md:grid-cols-2">
                    {CARDS.filter((c) => g.has(c.status)).map((c) => (
                      <CardView key={c.id} c={c} />
                    ))}
                  </ul>
                </m.section>
              ))}
            </AnimatePresence>
          </m.div>
        </LazyMotion>
      </Container>
    </Section>
  );
}
