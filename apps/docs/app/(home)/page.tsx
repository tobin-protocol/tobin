import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { NettingVisual } from "@/components/home/NettingVisual";
import { Lifecycle, Stages } from "@/components/home/Chains";
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

const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] px-5 py-2.5 text-base font-medium transition-colors";

function SectionHead({ id, eyebrow, title, text }: { id: string; eyebrow: string; title: string; text?: string }) {
  return (
    <div className="max-w-2xl">
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
        <div className="mx-auto grid w-full max-w-[1200px] items-center gap-12 px-4 pb-16 pt-14 md:px-6 md:pb-24 md:pt-20 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-background/80 px-3 py-1.5 font-label text-xs uppercase tracking-[0.1em] text-fd-muted-foreground backdrop-blur">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-fd-muted-foreground" />
              Experimental · Stellar Testnet · Not production-ready
            </p>
            <span className="mt-8 flex size-14 items-center justify-center rounded-[12px] bg-[var(--color-ink-soft)] text-white dark:bg-[var(--color-paper)] dark:text-[var(--color-ink)]">
              <BrandMark className="size-8" />
            </span>
            <h1 className="mt-6 font-display text-[clamp(2.5rem,5.4vw,4.5rem)] font-medium leading-[1.02] tracking-[-0.03em]">
              Tobin Developer Documentation
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-snug text-fd-muted-foreground md:text-xl">
              Record obligations. Net them deterministically. Approve the exact result. Settle only what is left.
              This is how the system is built, run and changed.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/docs" className={`${buttonBase} bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/85`}>
                Explore Documentation <span aria-hidden="true">→</span>
              </Link>
              <a href={REPO} className={`${buttonBase} border border-fd-border bg-fd-background hover:bg-fd-accent`}>
                Contribute on GitHub
              </a>
            </div>
          </div>
          <NettingVisual />
        </div>
      </section>

      {/* Status */}
      <section aria-labelledby="status-heading" className="mx-auto max-w-[1200px] px-4 pt-14 md:px-6">
        <div className="rounded-[16px] border border-fd-border bg-fd-card p-5 md:flex md:items-start md:gap-8 md:p-7">
          <h2 id="status-heading" className="font-label text-xs uppercase tracking-[0.12em] text-fd-muted-foreground md:w-40 md:shrink-0 md:pt-1">
            Project status
          </h2>
          <p className="mt-2 text-lg leading-snug md:mt-0">
            Tobin is <strong className="font-medium">experimental</strong> and targets{" "}
            <strong className="font-medium">Stellar Testnet</strong>. It is{" "}
            <strong className="font-medium">not production-ready</strong>. Mainnet and real-value use are not
            authorised, and nothing has been independently audited.{" "}
            <Link
              href="/docs/introduction/project-status"
              className="underline decoration-1 underline-offset-[3px] hover:decoration-2"
            >
              Read the full status
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Start here */}
      <section aria-labelledby="entry-heading" className="mx-auto max-w-[1200px] px-4 pt-20 md:px-6">
        <SectionHead id="entry-heading" eyebrow="Start here" title="Find your way in" />
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e, i) => (
            <li key={e.href} className={i === entries.length - 1 ? "sm:col-span-2 lg:col-span-3" : ""}>
              <Link
                href={e.href}
                className="group relative flex h-full min-h-40 flex-col justify-between gap-6 overflow-hidden rounded-[16px] border border-fd-border bg-fd-background p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-fd-foreground/40 hover:bg-fd-card"
              >
                <span className="font-label text-sm tabular-nums text-fd-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-heading text-xl font-medium tracking-[-0.01em]">{e.title}</span>
                    <span
                      aria-hidden="true"
                      className="translate-x-0 text-fd-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-fd-foreground"
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

      {/* Run it */}
      <section aria-labelledby="run-heading" className="mx-auto max-w-[1200px] px-4 pb-24 pt-24 md:px-6">
        <div className="grid gap-8 rounded-[24px] border border-fd-border bg-fd-card p-6 md:p-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <p className="font-label text-xs uppercase tracking-[0.12em] text-fd-muted-foreground">Run it</p>
            <h2 id="run-heading" className="mt-3 font-display text-3xl font-medium leading-[1.05] tracking-[-0.02em] md:text-4xl">
              From clone to console
            </h2>
            <p className="mt-4 text-lg leading-snug text-fd-muted-foreground">
              Node 24 and npm are enough for the application, the SDK and these docs. Rust is needed only for the
              contracts.
            </p>
            <Link
              href="/docs/getting-started/install-and-run"
              className="mt-6 inline-block underline decoration-1 underline-offset-[3px] hover:decoration-2"
            >
              Full install and run guide
            </Link>
          </div>
          <pre className="overflow-x-auto rounded-[16px] border border-fd-border bg-fd-background p-5 font-mono text-sm leading-7">
            <code>
              <span className="text-fd-muted-foreground">$ </span>git clone https://github.com/tobin-protocol/tobin.git{"\n"}
              <span className="text-fd-muted-foreground">$ </span>cd tobin{"\n"}
              <span className="text-fd-muted-foreground">$ </span>npm ci{"\n"}
              <span className="text-fd-muted-foreground">$ </span>npm run dev --workspace tobin-web-console{"\n"}
              <span className="text-fd-muted-foreground"># http://127.0.0.1:8787</span>
            </code>
          </pre>
        </div>
      </section>
    </main>
  );
}
