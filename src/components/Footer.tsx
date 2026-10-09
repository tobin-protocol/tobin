import { links, navLinks } from "@/lib/site";
import { Logo } from "./Logo";

type Dest = { label: string; href: string | null; external?: boolean };

const protocolLinks: Dest[] = navLinks.map((l) => ({ label: l.label, href: l.href }));
const resourceLinks: Dest[] = [
  { label: "Documentation", href: links.docs, external: true },
  { label: "GitHub", href: links.github, external: true },
];

const linkClass =
  "rounded-md py-1 text-[0.9375rem] text-paper/70 underline decoration-transparent underline-offset-4 transition-colors hover:text-paper hover:decoration-current";

/** A dashed rule with a small mono label, the way the section dividers read. */
function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4 text-paper/60">
      <span className="spaced">{label}</span>
      <span aria-hidden="true" className="h-px flex-1 border-t border-dashed border-paper/20" />
    </div>
  );
}

function Column({ title, items }: { title: string; items: Dest[] }) {
  return (
    <div>
      <h3 className="text-[0.9375rem] font-semibold text-paper">{title}</h3>
      <ul className="mt-4 flex flex-col gap-1.5">
        {items.map((d) => (
          <li key={d.label}>
            {d.href ? (
              <a
                href={d.href}
                className={linkClass}
                {...(d.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {d.label}
              </a>
            ) : (
              <span className="inline-flex items-center gap-2 py-1 text-[0.9375rem] text-paper/65">
                {d.label}
                <span className="whitespace-nowrap rounded-full bg-paper/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]">
                  Link pending
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A wide button row. Known destinations are links; unknown ones are marked as pending. */
function Row({ label, href, light = false, external = false }: { label: string; href: string | null; light?: boolean; external?: boolean }) {
  const base = "flex h-12 w-full items-center justify-between gap-3 rounded-xl px-5 text-[0.9375rem] font-medium";
  if (!href) {
    return (
      <span className={`${base} border border-dashed border-paper/25 text-paper/60`}>
        {label}
        <span className="whitespace-nowrap rounded-full bg-paper/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]">
          Link pending
        </span>
      </span>
    );
  }
  return (
    <a
      href={href}
      className={`${base} btn-row transition-colors ${light ? "bg-paper text-ink hover:bg-white" : "bg-paper/10 text-paper hover:bg-paper/[0.16]"}`}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {label}
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 8h10M9 4l4 4-4 4" />
      </svg>
    </a>
  );
}

/**
 * Footer as two dark panels: the main one carries the logo lockup, navigation
 * and credit; the side one carries the product line and the ways onward.
 */
export function Footer() {
  return (
    <footer data-surface="dark" data-nav-tone="dark" className="bg-ink px-3 pb-3 text-paper sm:px-5 sm:pb-5">
      <div className="mx-auto grid max-w-[90rem] gap-3 lg:grid-cols-[minmax(0,1fr)_22rem] sm:gap-4">
        {/* Main panel */}
        <div className="rounded-[1.75rem] border border-paper/10 bg-paper/[0.04] p-6 sm:p-10">
          {/* The brand lockup, flat white on the near-black panel, set large as the footer's anchor. */}
          <a href="#top" aria-label="Tobin, back to top" className="inline-flex rounded-md">
            <Logo variant="lockup" theme="dark" flat decorative className="h-[clamp(6rem,19vw,14rem)]" />
          </a>

          <div className="mt-14 sm:mt-16">
            <Divider label="Navigation" />
            <div className="mt-8 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
              <Column title="Explore" items={protocolLinks} />
              <Column title="Resources" items={resourceLinks} />
            </div>
          </div>

          <div className="mt-14 sm:mt-16">
            <Divider label="Credit" />
            <div className="mt-6 flex flex-col gap-2 text-[0.875rem] text-paper/60 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
              <p>© 2026 Tobin Clearing Protocol.</p>
              <p className="sm:max-w-[26rem] sm:text-right">
                Illustrative figures on this page are examples, not real transaction data.
              </p>
            </div>
          </div>
        </div>

        {/* Side panel */}
        <div className="relative flex flex-col justify-between gap-10 overflow-hidden rounded-[1.75rem] border border-paper/10 bg-paper/[0.06] p-6 sm:p-8">
          {/* A faint, oversized mark fills the quiet middle of the card. */}
          <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 opacity-[0.06]">
            <Logo variant="symbol" theme="dark" flat decorative className="h-60 w-60" />
          </span>
          <div className="relative">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-paper/60">Tobin</p>
            <p className="mt-4 text-[1.375rem] font-semibold leading-snug tracking-[-0.015em]">
              An open clearing layer for institutional payments on Stellar.
            </p>
          </div>

          <div className="relative flex flex-col gap-2.5">
            <Row label="Documentation" href={links.docs} light external />
            <Row label="GitHub" href={links.github} external />
            <Row label="Back to top" href="#top" />
          </div>
        </div>
      </div>
    </footer>
  );
}
