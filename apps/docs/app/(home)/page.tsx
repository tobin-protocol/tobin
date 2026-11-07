import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { REPO } from "@/lib/site";

const entries = [
  { href: "/docs/introduction/what-is-tobin", title: "Introduction", text: "What Tobin is, who it is for, and what it is not." },
  { href: "/docs/getting-started/prerequisites", title: "Getting Started", text: "Tools, install, run and the developer onboarding path." },
  { href: "/docs/architecture", title: "Architecture", text: "Layers, trust boundaries, netting versus contract validation." },
  { href: "/docs/concepts/domain-model", title: "Core Concepts", text: "The domain model, the clearing lifecycle and the invariants." },
  { href: "/docs/development/repository-layout", title: "Development Guides", text: "Repository layout, workflow, testing, contracts and CI." },
  { href: "/docs/reference", title: "API and SDK Reference", text: "The engine, SDK, contracts, errors, routes and commands that exist today." },
  { href: "/docs/resources/contributing", title: "Contributing", text: "How to propose and send a change, and how documentation is governed." },
];

const buttonBase =
  "inline-flex min-h-11 items-center justify-center rounded-[8px] px-4 py-2.5 text-base font-medium transition-colors";

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-20 pt-16 md:px-6 md:pt-24">
      <section className="max-w-3xl">
        <span className="mb-6 flex size-14 items-center justify-center rounded-[12px] bg-[var(--color-ink-soft)] text-white dark:bg-[var(--color-paper)] dark:text-[var(--color-ink)]">
          <BrandMark className="size-8" />
        </span>
        <h1 className="font-display text-[clamp(2.25rem,4.5vw,4rem)] font-medium leading-[1.05] tracking-[-0.02em]">
          Tobin Developer Documentation
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-snug text-fd-muted-foreground">
          How the Tobin Clearing Protocol repository is built, run and changed: obligations, deterministic netting,
          reviewer approval, settlement preparation, and the Soroban contracts that settle on Stellar Testnet.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/docs"
            className={`${buttonBase} bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/85`}
          >
            Explore Documentation
          </Link>
          <a
            href={REPO}
            className={`${buttonBase} bg-fd-secondary text-fd-secondary-foreground hover:bg-fd-accent`}
          >
            Contribute on GitHub
          </a>
        </div>
      </section>

      <section
        aria-labelledby="status-heading"
        className="mt-14 max-w-3xl rounded-[16px] border border-fd-border bg-fd-card p-5 md:p-6"
      >
        <h2 id="status-heading" className="text-xl font-medium">
          Project status
        </h2>
        <p className="mt-2 text-fd-muted-foreground">
          Tobin is <strong className="font-medium text-fd-foreground">experimental</strong> and targets{" "}
          <strong className="font-medium text-fd-foreground">Stellar Testnet</strong>. It is{" "}
          <strong className="font-medium text-fd-foreground">not production-ready</strong>. Mainnet and real-value
          use are not authorised, and nothing has been independently audited.{" "}
          <Link
            href="/docs/introduction/project-status"
            className="text-fd-foreground underline decoration-1 underline-offset-[3px] hover:decoration-2"
          >
            Read the full status
          </Link>
          .
        </p>
      </section>

      <section aria-labelledby="entry-heading" className="mt-14">
        <h2 id="entry-heading" className="text-2xl font-medium md:text-3xl">
          Start here
        </h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e) => (
            <li key={e.href}>
              <Link
                href={e.href}
                className="group flex h-full flex-col rounded-[16px] border border-fd-border p-5 transition-colors hover:bg-fd-accent"
              >
                <span className="text-lg font-medium">{e.title}</span>
                <span className="mt-1 text-sm text-fd-muted-foreground">{e.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="path-heading" className="mt-14 max-w-3xl">
        <h2 id="path-heading" className="text-2xl font-medium md:text-3xl">
          New to the repository?
        </h2>
        <ol className="mt-5 list-decimal space-y-2 pl-5 text-fd-muted-foreground marker:text-fd-foreground">
          <li>
            Read the <Link className="text-fd-foreground underline underline-offset-[3px]" href="/docs/introduction/project-status">project status</Link>.
          </li>
          <li>
            Learn the <Link className="text-fd-foreground underline underline-offset-[3px]" href="/docs/concepts/domain-model">domain model</Link> and the{" "}
            <Link className="text-fd-foreground underline underline-offset-[3px]" href="/docs/architecture/state-and-trust-boundaries">trust boundaries</Link>.
          </li>
          <li>
            <Link className="text-fd-foreground underline underline-offset-[3px]" href="/docs/getting-started/install-and-run">Install and run</Link> the code.
          </li>
          <li>
            Run the <Link className="text-fd-foreground underline underline-offset-[3px]" href="/docs/development/testing">tests</Link> for the layer you will change.
          </li>
          <li>
            Follow the <Link className="text-fd-foreground underline underline-offset-[3px]" href="/docs/getting-started/onboarding-path">onboarding path</Link>.
          </li>
        </ol>
      </section>
    </main>
  );
}
