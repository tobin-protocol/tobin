"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { links, navLinks } from "@/lib/site";
import { Logo } from "./Logo";

/*
 * Navigation in the Partyverse manner: a centred cluster of floating, rounded
 * pieces with nothing behind them. From md up: logo pill, one pill holding all
 * the links, and a white call to action. Below md: logo pill and a Menu pill
 * that opens a dropdown panel.
 *
 * The dark pieces are always ink with a hairline border and the call to action
 * is always paper, so the bar reads over every section without tone switching.
 */

const pill =
  "pointer-events-auto flex h-12 items-center rounded-2xl border border-paper/15 bg-ink/90 text-paper backdrop-blur-md";

const linkClass =
  "btn-press flex h-11 items-center rounded-xl px-4 text-[0.9375rem] font-medium text-paper/80 transition-colors hover:bg-paper/10 hover:text-paper";

export function Nav() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLAnchorElement>(null);
  const wasOpen = useRef(false);

  // Escape closes; focus moves in on open and back to the button on close.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      firstRef.current?.focus();
      const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
    if (wasOpen.current) toggleRef.current?.focus();
  }, [open]);

  const cta = links.docs ?? "#protocol";
  const items = [
    ...navLinks.map((l) => ({ ...l, external: false })),
    ...(links.github ? [{ href: links.github, label: "GitHub", external: true }] : []),
  ];
  const close = () => setOpen(false);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50">
      {open ? (
        // Click-outside catcher, a sibling of the panel so no transformed ancestor traps it.
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          onClick={close}
          className="pointer-events-auto fixed inset-0 z-[55] cursor-default md:hidden"
        />
      ) : null}

      <nav
        aria-label="Primary"
        className="relative z-[60] mx-auto flex w-full max-w-[72rem] items-start justify-between gap-2 px-4 pt-3 sm:px-8 sm:pt-4 md:justify-center"
      >
        {/* Logo pill: glossy lockup, 30px, on near-black. Clear space is the pill padding. */}
        <div data-surface="dark" className={`${pill} px-3.5`}>
          <a href="#top" aria-label="Tobin, back to top" className="flex h-12 items-center rounded-md">
            <Logo variant="lockup" theme="dark" height={30} decorative />
          </a>
        </div>

        {/* Links pill (md+) */}
        <ul data-surface="dark" className={`${pill} hidden gap-1 px-2 md:flex`}>
          {items.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className={linkClass}
                {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        {/* Call to action (md+) */}
        <a
          href={cta}
          className="btn-press pointer-events-auto hidden h-12 items-center rounded-2xl bg-paper px-5 text-[0.9375rem] font-semibold text-ink shadow-[0_6px_24px_-8px_rgba(0,0,0,0.45)] ring-1 ring-ink/10 transition-colors hover:bg-white md:flex"
        >
          Explore the Protocol
        </a>

        {/* Menu pill (below md) */}
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen((v) => !v)}
          data-surface="dark"
          className={`${pill} btn-press gap-2.5 px-4 text-[0.9375rem] font-medium md:hidden`}
        >
          Menu
          <span className="relative block h-2.5 w-4" aria-hidden="true">
            <span className={`absolute left-0 h-[1.5px] w-4 rounded bg-current transition-transform duration-200 ease-out ${open ? "top-[4.25px] rotate-45" : "top-0"}`} />
            <span className={`absolute left-0 h-[1.5px] w-4 rounded bg-current transition-transform duration-200 ease-out ${open ? "top-[4.25px] -rotate-45" : "top-[8.5px]"}`} />
          </span>
        </button>
      </nav>

      {/* Dropdown (below md): scales out from the Menu pill */}
      <AnimatePresence>
        {open ? (
          <m.div
            id="site-menu"
            data-surface="dark"
            className="pointer-events-auto absolute right-4 top-[4.75rem] z-[60] w-[min(20rem,calc(100vw-2rem))] origin-top-right rounded-3xl border border-paper/15 bg-ink/95 p-3 text-paper shadow-[0_24px_48px_-16px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:right-8 md:hidden"
            initial={{ opacity: 0, scale: 0.94, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -6 }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
          >
            <ul>
              {items.map((l, i) => (
                <li key={l.href}>
                  <a
                    ref={i === 0 ? firstRef : undefined}
                    href={l.href}
                    onClick={close}
                    className="block rounded-2xl px-4 py-3 font-display text-[1.75rem] uppercase leading-none transition-colors hover:bg-paper/10 active:bg-paper/10"
                    {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <a
              href={cta}
              onClick={close}
              className="btn-press mt-2 flex h-12 items-center justify-center rounded-2xl bg-paper text-[0.9375rem] font-semibold text-ink"
            >
              Explore the Protocol
            </a>
          </m.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
