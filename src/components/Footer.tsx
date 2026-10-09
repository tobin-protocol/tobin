import { links, navLinks } from "@/lib/site";
import { Container } from "./ui";
import { Wordmark } from "./Wordmark";

// Full paper on accent: anything dimmer drops below AA (70% paper is 3.6:1).
const linkClass =
  "rounded-md py-1 text-[0.9375rem] underline-offset-4 transition-[text-decoration-color] decoration-transparent underline hover:decoration-current";

export function Footer() {
  return (
    <footer data-surface="accent" data-nav-tone="dark" className="bg-accent py-16 text-paper">
      <Container className="grid gap-12 md:grid-cols-[1fr_auto] md:gap-16">
        <div>
          <Wordmark markClassName="text-paper" />
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

        <p className="spaced border-t border-paper/30 pt-6 leading-relaxed md:col-span-2">
          © 2026 Tobin Clearing Protocol. Illustrative figures on this page are
          examples, not real transaction data.
        </p>
      </Container>
    </footer>
  );
}
