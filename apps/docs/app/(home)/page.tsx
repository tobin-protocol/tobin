import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { NettingVisual } from "@/components/home/NettingVisual";
import { Lifecycle, Stages } from "@/components/home/Chains";
import { Window } from "@/components/home/Window";
import { REPO } from "@/lib/site";

const entries = [
  { href: "/docs/introduction/what-is-tobin", title: "Introduction", text: "What Tobin is, who it is for, and what it is not." },
  { href: "/docs/getting-started/prerequisites", title: "Getting Started", text: "Tools, install, run, and the developer onboarding path." },
  { href: "/docs/architecture", title: "Architecture", text: "Layers, trust boundaries, and netting versus contract validation." },
  { href: "/docs/concepts/domain-model", title: "Core Concepts", text: "The domain model, the clearing lifecycle and the invariants." },
  { href: "/docs/development/repository-layout", title: "Development Guides", text: "Repository layout, workflow, testing, contracts and CI." },
  { href: "/docs/reference", title: "API and SDK Reference", text: "The engine, SDK, contracts, errors, routes and commands that exist today." },
  { href: "/docs/resources/contributing", title: "Contributing", text: "Fork, branch, test, and send a change. How documentation is governed." },
];

const builtWith = ["Stellar", "Soroban", "Rust", "TypeScript", "Next.js", "SQLite", "Freighter"];

const workflow = [
  {
    img: "/img/console-obligations.webp",
    w: 620,
    h: 440,
    alt: "The console's obligations tab listing three active obligations: Alice owes Bob 100, Bob owes Carol 80 and Carol owes Alice 70, plus one voided entry.",
    title: "Record obligations",
    text: "A debtor, a creditor and a whole-number amount in one asset. Corrections are voided, never erased, so the history stays visible.",
    href: "/docs/concepts/domain-model",
  },
  {
    img: "/img/console-authorization.webp",
    w: 620,
    h: 600,
    alt: "The console's authorization tab showing a calculation approved by a reviewer, with net positions for Bob, Carol and Alice and a decision history.",
    title: "Review the exact result",
    text: "A reviewer approves or rejects one exact calculation. Nobody decides on a result they recorded, changed or calculated.",
    href: "/docs/architecture/authentication-and-authorization",
  },
  {
    img: "/img/console-settlement-prep.webp",
    w: 620,
    h: 380,
    alt: "The console's settlement preparation tab: calculation complete, approved, batch prepared, with wallet signing, submission and confirmation marked not available.",
    title: "Prepare, never execute",
    text: "An approved calculation becomes reviewable transfer instructions. Preparation moves no funds; execution is a separate, owner-run step.",
    href: "/docs/architecture/stellar-execution",
  },
];

const btn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] px-5 py-2.5 text-base font-medium transition-colors";

function SectionHead({
  id,
  eyebrow,
  title,
  text,
  center = false,
}: {
  id: string;
  eyebrow: string;
  title: string;
  text?: string;
  center?: boolean;
}) {
  return (
    <div className={`max-w-2xl ${center ? "mx-auto text-center" : ""}`}>
      <p className="font-label text-xs uppercase tracking-[0.12em] text-fd-muted-foreground">{eyebrow}</p>
      <h2 id={id} className="mt-3 font-display text-3xl font-medium leading-[1.05] tracking-[-0.02em] md:text-5xl">
        {title}
      </h2>
      {text && <p className="mt-4 text-lg leading-snug text-fd-muted-foreground">{text}</p>}
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="flex-1 overflow-x-clip">
      {/* Hero */}
      <section className="hero-grid border-b border-fd-border">
        <div className="mx-auto max-w-[1200px] px-4 pb-8 pt-14 text-center md:px-6 md:pt-20">
          <p className="mx-auto inline-flex max-w-full items-center gap-2 rounded-full border border-fd-border bg-fd-background/80 px-3 py-1.5 font-label text-[0.68rem] uppercase tracking-[0.1em] text-fd-muted-foreground backdrop-blur sm:text-xs">
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-fd-muted-foreground" />
            Experimental · Stellar Testnet · Not production-ready
          </p>
          <span className="mx-auto mt-8 flex size-14 items-center justify-center rounded-[12px] bg-[var(--color-ink-soft)] text-white dark:bg-[var(--color-paper)] dark:text-[var(--color-ink)]">
            <BrandMark className="size-8" />
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl font-display text-[clamp(2.5rem,6vw,5rem)] font-medium leading-[1.02] tracking-[-0.03em]">
            Tobin Developer Documentation
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-snug text-fd-muted-foreground md:text-xl">
            Record obligations. Net them deterministically. Approve the exact result. Settle only what is left. This
            is how the system is built, run and changed.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/docs" className={`${btn} bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/85`}>
              Explore Documentation <span aria-hidden="true">→</span>
            </Link>
            <a href={REPO} className={`${btn} border border-fd-border bg-fd-background hover:bg-fd-accent`}>
              Contribute on GitHub
            </a>
          </div>
        </div>

        {/* Stage */}
        <div className="mx-auto max-w-[1200px] px-4 pb-14 pt-10 md:px-6 md:pb-20">
          <div className="stage rounded-[24px] p-3 sm:p-6 md:p-10">
            <div className="relative mx-auto max-w-[920px]">
              <Window
                src="/img/console-net-positions.webp"
                alt="The Tobin console's net positions tab: three net positions calculated from three obligations, Alice owing 30, Bob owed 20 and Carol owed 10, summing to zero."
                width={980}
                height={1000}
                priority
                className="max-h-[560px] md:max-h-[640px]"
                imageClassName="object-cover object-top"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-28 rounded-b-[14px] bg-gradient-to-t from-[#121212] to-transparent"
              />
            </div>
          </div>
          <p className="mt-3 text-center text-sm text-fd-muted-foreground">
            The web console&apos;s net positions tab, running locally on demonstration data with fictional participants.
          </p>
        </div>
      </section>

      {/* Built with */}
      <section aria-label="Built with" className="border-b border-fd-border">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-8 md:px-6">
          <p className="font-label text-xs uppercase tracking-[0.12em] text-fd-muted-foreground">Built with</p>
          {builtWith.map((n) => (
            <span key={n} className="font-heading text-xl font-medium tracking-[-0.01em] text-fd-muted-foreground">
              {n}
            </span>
          ))}
        </div>
      </section>

      {/* Featured: netting */}
      <section aria-labelledby="featured-heading" className="mx-auto max-w-[1200px] px-4 pt-20 md:px-6">
        <div className="dark rounded-[24px] bg-[#0c0c0c] p-5 text-fd-foreground md:p-10">
          <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="font-label text-xs uppercase tracking-[0.12em] text-fd-muted-foreground">Clearing, explained</p>
              <h2
                id="featured-heading"
                className="mt-3 font-display text-3xl font-medium leading-[1.05] tracking-[-0.02em] md:text-5xl"
              >
                Settle what is left, not everything that was owed.
              </h2>
              <p className="mt-5 text-lg leading-snug text-fd-muted-foreground">
                Institutions with recurring obligations to several counterparties usually settle each one on its own,
                though most of them offset. Tobin nets them deterministically, so only the net amounts move.
              </p>
              <p className="mt-4 text-sm text-fd-muted-foreground">
                Net position = outgoing − incoming. Positions across a session always sum to zero. The contract accepts
                any valid plan, so this default is one valid plan, not the only one.
              </p>
              <Link
                href="/docs/architecture/netting-and-validation"
                className="mt-6 inline-block underline decoration-1 underline-offset-[3px] hover:decoration-2"
              >
                How netting and contract validation differ
              </Link>
            </div>
            <NettingVisual />
          </div>
        </div>
      </section>

      {/* Facts */}
      <section aria-labelledby="facts-heading" className="mx-auto max-w-[1200px] px-4 pt-20 md:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:items-center">
          <div>
            <h2 id="facts-heading" className="font-display text-2xl font-medium leading-tight tracking-[-0.02em] md:text-4xl">
              Clearing for institutions that already move money on Stellar.
            </h2>
            <p className="mt-4 text-lg leading-snug text-fd-muted-foreground">
              Tobin sits above Stellar&apos;s existing standards. It is deliberately small, and these are the numbers
              the code can back up.
            </p>
          </div>
          <dl className="grid divide-y divide-fd-border border-y border-fd-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              { n: "4", t: "on-chain session states", d: "OPEN, COMMITTED, APPROVED, SETTLED. No others." },
              { n: "8", t: "Testnet transactions", d: "From session creation to settle, one at a time." },
              { n: "0", t: "Mainnet code paths", d: "Wallet sign-in and signer recording accept Testnet only." },
            ].map((f) => (
              <div key={f.t} className="py-6 sm:px-6 sm:first:pl-0">
                <dt className="sr-only">{f.t}</dt>
                <dd>
                  <span className="font-display text-6xl font-medium leading-none tracking-[-0.04em] tabular-nums md:text-7xl">
                    {f.n}
                  </span>
                  <span className="mt-3 block font-medium">{f.t}</span>
                  <span className="mt-1 block text-sm text-fd-muted-foreground">{f.d}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Workflow with real screenshots */}
      <section aria-labelledby="workflow-heading" className="mx-auto max-w-[1200px] px-4 pt-24 md:px-6">
        <SectionHead
          id="workflow-heading"
          eyebrow="One workflow"
          title="From a recorded obligation to a prepared settlement."
          text="Screens from the web console, running locally on demonstration data."
          center
        />
        <ul className="mt-12 grid gap-4 lg:grid-cols-3">
          {workflow.map((c) => (
            <li key={c.title} className="flex flex-col rounded-[20px] border border-fd-border bg-fd-card p-3">
              <div className="overflow-hidden rounded-[12px]">
                <Window
                  src={c.img}
                  alt={c.alt}
                  width={c.w}
                  height={c.h}
                  title="Tobin Console"
                  className="h-64 shadow-none sm:h-72"
                  imageClassName="object-cover object-top"
                />
              </div>
              <div className="flex flex-1 flex-col p-3 pt-5">
                <h3 className="font-heading text-xl font-medium tracking-[-0.01em]">{c.title}</h3>
                <p className="mt-2 flex-1 text-sm text-fd-muted-foreground">{c.text}</p>
                <Link
                  href={c.href}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium underline decoration-1 underline-offset-[3px] hover:decoration-2"
                >
                  Read more <span aria-hidden="true">→</span>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Everything in the docs */}
      <section aria-labelledby="entry-heading" className="mx-auto max-w-[1200px] px-4 pt-24 md:px-6">
        <SectionHead id="entry-heading" eyebrow="Documentation" title="Everything you need to build on Tobin" />
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e, i) => (
            <li key={e.href} className={i === entries.length - 1 ? "sm:col-span-2 lg:col-span-3" : ""}>
              <Link
                href={e.href}
                className="group relative flex h-full min-h-36 flex-col justify-between gap-6 overflow-hidden rounded-[16px] border border-fd-border bg-fd-background p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-fd-foreground/40 hover:bg-fd-card"
              >
                <span className="font-label text-sm tabular-nums text-fd-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-heading text-xl font-medium tracking-[-0.01em]">{e.title}</span>
                    <span
                      aria-hidden="true"
                      className="text-fd-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-fd-foreground"
                    >
                      →
                    </span>
                  </span>
                  <span className="mt-1 block text-sm text-fd-muted-foreground">{e.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Lifecycle */}
      <section aria-labelledby="lifecycle-heading" className="mx-auto max-w-[1200px] px-4 pt-24 md:px-6">
        <SectionHead
          id="lifecycle-heading"
          eyebrow="On chain"
          title="Four states. No others."
          text="The clearing contract moves a session through four states. A proposal is data, not a state, and replacing it clears every approval."
        />
        <div className="mt-10">
          <Lifecycle />
        </div>
      </section>

      {/* Boundaries */}
      <section aria-labelledby="boundaries-heading" className="mx-auto max-w-[1200px] px-4 pt-24 md:px-6">
        <SectionHead
          id="boundaries-heading"
          eyebrow="Trust boundaries"
          title="None of these implies the next."
          text="A prepared batch is not a signed transaction, a signed one is not a submitted one, and a confirmed one is not settled until it is reconciled."
        />
        <div className="mt-10">
          <Stages />
        </div>
        <p className="mt-6 text-sm text-fd-muted-foreground">
          <Link
            href="/docs/architecture/state-and-trust-boundaries"
            className="underline decoration-1 underline-offset-[3px] hover:decoration-2"
          >
            Read how Tobin keeps application state and on-chain state apart
          </Link>
          .
        </p>
      </section>

      {/* Closing call to action */}
      <section aria-labelledby="cta-heading" className="relative mt-24 overflow-hidden border-t border-fd-border">
        <div className="mx-auto max-w-[1200px] px-4 pb-8 pt-20 text-center md:px-6 md:pt-28">
          <h2
            id="cta-heading"
            className="mx-auto max-w-3xl font-display text-4xl font-medium leading-[1.03] tracking-[-0.03em] md:text-6xl"
          >
            Every obligation, netted and approved.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-fd-muted-foreground">
            Node 24 and npm are enough to run the application, the SDK and these docs.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/docs/getting-started/install-and-run"
              className={`${btn} bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/85`}
            >
              Install and run <span aria-hidden="true">→</span>
            </Link>
            <Link href="/docs/resources/contributing" className={`${btn} border border-fd-border bg-fd-background hover:bg-fd-accent`}>
              Contribute
            </Link>
          </div>
          <pre className="mx-auto mt-10 max-w-xl overflow-x-auto rounded-[16px] border border-fd-border bg-fd-card p-5 text-left font-mono text-sm leading-7">
            <code>
              <span className="text-fd-muted-foreground">$ </span>git clone https://github.com/tobin-protocol/tobin.git{"\n"}
              <span className="text-fd-muted-foreground">$ </span>cd tobin &amp;&amp; npm ci{"\n"}
              <span className="text-fd-muted-foreground">$ </span>npm run dev --workspace tobin-web-console
            </code>
          </pre>
        </div>
        <p
          aria-hidden="true"
          className="wordmark pointer-events-none select-none text-center font-display font-medium"
        >
          Tobin
        </p>
      </section>
    </main>
  );
}
