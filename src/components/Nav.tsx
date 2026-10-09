"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { links, navLinks } from "@/lib/site";
import { Logo } from "./Logo";

/*
 * Navigation = Partyverse's floating pills (logo left, call to action right,
 * nothing behind them) + Web3Flutter's drip menu (a blob hanging from the top
 * edge that springs open into a panel of roll links).
 *
 * The pills are always ink-on-paper-on-ink, so they read over every section;
 * the blob carries an ink outline so it never vanishes into the amber one.
 */

const SPRING = { type: "spring", stiffness: 300, damping: 28 } as const;

// Same command count and order in both shapes, so the path can morph. The
// closed one is a 140x48 drop; the open one a 340x320 panel with a drip below.
const PATH_CLOSED =
  "M0 0 H140 V0 C0 0 0 0 0 0 L140 0 C140 0 140 8 130 18 C120 28 115 38 100 42 C90 44.5 80 46 70 46 C60 46 50 44.5 40 42 C25 38 20 28 10 18 C0 8 0 0 0 0 L0 0 C0 0 0 0 0 0 V0 Z";
const PATH_OPEN =
  "M0 0 H340 V252 C340 266 332 272 320 272 L240 272 C240 272 240 280 230 290 C220 300 215 310 200 314 C190 316.5 180 318 170 318 C160 318 150 316.5 140 314 C125 310 120 300 110 290 C100 280 100 272 100 272 L20 272 C8 272 0 266 0 252 V0 Z";
const OPEN_W = 340;

const pill =
  "pointer-events-auto flex h-12 items-center rounded-2xl border border-paper/15 bg-ink/90 text-paper backdrop-blur-md";

/** A roll link: the label rolls away while the same label, in mono caps, rolls in. */
function RollRow({
  href,
  label,
  external,
  onClick,
  innerRef,
}: {
  href: string;
  label: string;
  external?: boolean;
  onClick: () => void;
  innerRef?: (el: HTMLAnchorElement | null) => void;
}) {
  return (
    <a
      ref={innerRef}
      href={href}
      onClick={onClick}
      className="roll flex w-full justify-start border-b border-ink/15 py-2.5 last:border-0"
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      <span className="roll-front font-display text-[2rem] uppercase leading-none !text-left">{label}</span>
      <span className="roll-back !text-left" aria-hidden="true">
        {label}
      </span>
    </a>
  );
}

export function Nav() {
  const [open, setOpen] = useState(false);
  const [k, setK] = useState(1);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLAnchorElement | null>(null);
  const wasOpen = useRef(false);

  // On very narrow screens the open panel scales down to fit.
  useEffect(() => {
    const fit = () => setK(Math.min(1, (window.innerWidth - 16) / OPEN_W));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

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
      {/* Pills */}
      <nav
        aria-label="Primary"
        className="mx-auto flex w-full max-w-[72rem] items-start justify-between px-4 pt-3 sm:px-8 sm:pt-4"
      >
        <div data-surface="dark" className={`${pill} px-3.5`}>
          {/* Glossy lockup, 30px high, on the near-black pill. Clear space (~19% of the symbol) is the pill padding. */}
          <a href="#top" aria-label="Tobin, back to top" className="flex items-center rounded-md">
            <Logo variant="lockup" theme="dark" height={30} decorative />
          </a>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          {links.github ? (
            <a
              href={links.github}
              target="_blank"
              rel="noopener noreferrer"
              data-surface="dark"
              className={`${pill} btn-press px-5 text-[0.9375rem] font-medium transition-colors hover:bg-ink`}
            >
              GitHub
            </a>
          ) : null}
          <a
            href={cta}
            className="btn-press pointer-events-auto flex h-12 items-center rounded-2xl bg-paper px-5 text-[0.9375rem] font-semibold text-ink shadow-[0_6px_24px_-8px_rgba(0,0,0,0.45)] ring-1 ring-ink/10 transition-colors hover:bg-white"
          >
            Explore the Protocol
          </a>
        </div>
      </nav>

      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          onClick={close}
          className="pointer-events-auto fixed inset-0 z-[55] cursor-default"
        />
      ) : null}

      {/* Drip menu, hanging from the top centre */}
      <div className="pointer-events-none fixed left-1/2 top-0 z-[60] -translate-x-1/2">

        <div style={{ transform: `scale(${k})`, transformOrigin: "top center" }}>
          <m.div
            className="pointer-events-auto relative overflow-hidden"
            animate={{ width: open ? OPEN_W : 140, height: open ? 320 : 48, y: open ? 14 : 0 }}
            transition={SPRING}
          >
            <svg width="100%" height="100%" fill="none" className="absolute inset-0" aria-hidden="true">
              <m.path
                animate={{ d: open ? PATH_OPEN : PATH_CLOSED }}
                transition={SPRING}
                className="fill-signal stroke-ink"
                strokeWidth={2}
              />
            </svg>

            <button
              ref={toggleRef}
              type="button"
              aria-expanded={open}
              aria-controls="site-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((v) => !v)}
              data-surface="signal"
              className="absolute left-1/2 top-0 z-20 flex h-11 w-full -translate-x-1/2 items-center justify-center rounded-b-3xl text-ink"
            >
              <AnimatePresence mode="wait" initial={false}>
                {open ? (
                  <m.span
                    key="x"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M4 4l12 12M16 4L4 16" />
                    </svg>
                  </m.span>
                ) : (
                  <m.span
                    key="burger"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
                      <rect y="0" width="22" height="2.2" rx="1.1" fill="currentColor" />
                      <rect y="5.8" width="22" height="2.2" rx="1.1" fill="currentColor" />
                      <rect y="11.6" width="22" height="2.2" rx="1.1" fill="currentColor" />
                    </svg>
                  </m.span>
                )}
              </AnimatePresence>
            </button>

            <AnimatePresence>
              {open ? (
                <m.div
                  id="site-menu"
                  data-surface="signal"
                  className="absolute inset-x-0 px-8 text-ink"
                  style={{ top: 48 }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 0.1, duration: 0.2 }}
                >
                  <ul>
                    {items.map((l, i) => (
                      <li key={l.href}>
                        <RollRow
                          href={l.href}
                          label={l.label}
                          external={l.external}
                          onClick={close}
                          innerRef={i === 0 ? (el) => { firstRef.current = el; } : undefined}
                        />
                      </li>
                    ))}
                  </ul>
                  {/* Below sm the pills drop their CTA; it lives here instead. */}
                  <a
                    href={cta}
                    onClick={close}
                    className="btn-press mt-3 flex h-11 items-center justify-center rounded-2xl bg-ink text-[0.9375rem] font-semibold text-paper sm:hidden"
                  >
                    Explore the Protocol
                  </a>
                </m.div>
              ) : null}
            </AnimatePresence>
          </m.div>
        </div>
      </div>
    </header>
  );
}
