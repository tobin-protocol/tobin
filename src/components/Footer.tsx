import { links, navLinks } from "@/lib/site";
import { Container } from "./ui";
import { Wordmark } from "./Wordmark";

const linkClass = "rounded-md py-1 text-[0.9375rem] text-ink-soft transition-colors hover:text-ink";

export function Footer() {
  return (
    <footer className="border-t border-line py-14">
      <Container className="grid gap-10 md:grid-cols-[1fr_auto] md:gap-16">
        <div>
          <Wordmark />
          <p className="text-body mt-4 max-w-[24rem] text-[0.9375rem]">
            An open clearing layer for institutional payments on Stellar.
          </p>
        </div>

        <nav aria-label="Footer">
          <ul className="flex flex-col gap-1.5 md:items-end">
            {navLinks.map((l) => (
              <li key={l.href}>
                <a href={l.href} className={linkClass}>
                  {l.label}
                </a>
              </li>
            ))}
            {links.docs ? (
              <li>
                <a href={links.docs} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  Documentation
                </a>
              </li>
            ) : null}
            {links.github ? (
              <li>
                <a href={links.github} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  GitHub
                </a>
              </li>
            ) : null}
          </ul>
        </nav>

        <p className="border-t border-line pt-6 text-[0.8125rem] text-ink-soft md:col-span-2">
          © 2026 Tobin Clearing Protocol. Illustrative figures on this page are
          examples, not real transaction data.
        </p>
      </Container>
    </footer>
  );
}
