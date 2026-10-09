"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useState } from "react";
import { links, navLinks } from "@/lib/site";
import { ButtonLink } from "./ui";
import { Wordmark } from "./Wordmark";

const linkClass =
  "rounded-md px-1 py-2 text-[0.9375rem] font-medium text-ink-soft transition-colors hover:text-ink";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const cta = links.docs ?? "#protocol";

  return (
    <header
      className="nav-material fixed inset-x-0 top-0 z-50"
      data-material={scrolled || open}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 w-full max-w-[72rem] items-center justify-between px-5 sm:px-8"
      >
        <Wordmark />

        <ul className="hidden items-center gap-7 md:flex">
          {navLinks.map((l) => (
            <li key={l.href}>
              <a href={l.href} className={linkClass}>
                {l.label}
              </a>
            </li>
          ))}
          {links.github ? (
            <li>
              <a
                href={links.github}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                GitHub
              </a>
            </li>
          ) : null}
        </ul>

        <div className="hidden md:block">
          <ButtonLink href={cta} small>
            Explore the Protocol
          </ButtonLink>
        </div>

        <button
          type="button"
          className="stage-tab -mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="relative block h-3 w-5" aria-hidden="true">
            <span
              className={`absolute left-0 h-[1.5px] w-5 rounded bg-ink transition-transform duration-200 ease-out ${open ? "top-[5.25px] rotate-45" : "top-0"}`}
            />
            <span
              className={`absolute left-0 h-[1.5px] w-5 rounded bg-ink transition-transform duration-200 ease-out ${open ? "top-[5.25px] -rotate-45" : "top-[10.5px]"}`}
            />
          </span>
        </button>
      </nav>

      <AnimatePresence>
        {open ? (
          <m.div
            id="mobile-menu"
            className="sheet-material absolute inset-x-3 top-[calc(100%+0.25rem)] origin-top-right rounded-3xl p-3 md:hidden"
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
          >
            <ul className="flex flex-col">
              {[
                ...navLinks,
                ...(links.github
                  ? [{ href: links.github, label: "GitHub" }]
                  : []),
              ].map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-2xl px-4 py-3.5 text-[1.0625rem] font-medium tracking-[-0.01em] active:bg-ink/5"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="p-1 pt-2" onClick={() => setOpen(false)}>
              <ButtonLink href={cta} className="w-full">
                Explore the Protocol
              </ButtonLink>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
