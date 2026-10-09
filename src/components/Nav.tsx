"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { lockScroll } from "@/lib/lenis";
import { links, navLinks } from "@/lib/site";
import { ButtonLink } from "./ui";
import { Wordmark } from "./Wordmark";

type Tone = "light" | "dark";

const PROBE_Y = 32;

/** Which surface is under the bar right now: the last [data-nav-tone] that spans the probe line. */
function toneAtTop(): Tone {
  let tone: Tone = "light";
  document.querySelectorAll<HTMLElement>("[data-nav-tone]").forEach((el) => {
    const r = el.getBoundingClientRect();
    // The seam clips the top of a curtain diagonally; sample its midpoint.
    // A curtain's wave edge hangs above its box; `data-nav-lead` counts that overhang.
    const lead = Number(el.dataset.navLead ?? 0);
    const top = r.top - lead + (el.classList.contains("seam") ? window.innerWidth * 0.02 : 0);
    if (top <= PROBE_Y && r.bottom > PROBE_Y) tone = el.dataset.navTone as Tone;
  });
  return tone;
}

function RollLink({ href, children, onClick }: { href: string; children: string; onClick?: () => void }) {
  return (
    <a
      href={href}
      onClick={onClick}
      className="roll nav-link rounded-md px-1 py-2 text-[0.9375rem] font-medium"
    >
      <span className="roll-front">{children}</span>
      <span className="roll-back" aria-hidden="true">
        {children}
      </span>
    </a>
  );
}

export function Nav() {
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [tone, setTone] = useState<Tone>("light");
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setScrolled(window.scrollY > 8);
      setTone(toneAtTop());
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Open sheet: freeze the page, make the rest inert, close on Escape, return focus.
  useEffect(() => {
    if (!open) return;
    const main = document.getElementById("main");
    lockScroll(true);
    main?.setAttribute("inert", "");
    firstLinkRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const toggle = toggleRef.current;
    return () => {
      lockScroll(false);
      main?.removeAttribute("inert");
      window.removeEventListener("keydown", onKey);
      toggle?.focus();
    };
  }, [open]);

  const cta = links.docs ?? "#protocol";
  const items = [
    ...navLinks,
    ...(links.github ? [{ href: links.github, label: "GitHub" }] : []),
  ];
  const lineClass =
    "nav-bar-line absolute left-0 h-[1.5px] w-5 rounded transition-transform duration-200 ease-out";

  return (
    <>
      <header
        className="nav-material fixed inset-x-0 top-0 z-50"
        data-material={scrolled || open}
        data-tone={open ? "signal" : tone}
      >
        <nav
          aria-label="Primary"
          className="mx-auto flex h-16 w-full max-w-[72rem] items-center justify-between px-5 sm:px-8"
        >
          <Wordmark markClassName="nav-mark" />

          <ul className="hidden items-center gap-7 md:flex">
            {items.map((l) => (
              <li key={l.href}>
                {l.href.startsWith("#") ? (
                  <RollLink href={l.href}>{l.label}</RollLink>
                ) : (
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nav-link rounded-md px-1 py-2 text-[0.9375rem] font-medium"
                  >
                    {l.label}
                  </a>
                )}
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <ButtonLink href={cta} small className="nav-cta">
              Explore the Protocol
            </ButtonLink>
          </div>

          <button
            ref={toggleRef}
            type="button"
            className="stage-tab -mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full md:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="relative block h-3 w-5" aria-hidden="true">
              <span className={`${lineClass} ${open ? "top-[5.25px] rotate-45" : "top-0"}`} />
              <span className={`${lineClass} ${open ? "top-[5.25px] -rotate-45" : "top-[10.5px]"}`} />
            </span>
          </button>
        </nav>
      </header>

      {/* Mobile sheet: a curtain wipe, links slide in one after another. */}
      <AnimatePresence>
        {open ? (
          <m.div
            id="mobile-menu"
            data-surface="signal"
            className="fixed inset-0 z-40 flex flex-col justify-between bg-signal px-6 pb-8 pt-24 text-ink md:hidden"
            initial={reduce ? { opacity: 0 } : { clipPath: "inset(0 0 100% 0)" }}
            animate={reduce ? { opacity: 1 } : { clipPath: "inset(0 0 0% 0)" }}
            exit={reduce ? { opacity: 0 } : { clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: reduce ? 0.2 : 0.45, ease: [0.76, 0, 0.24, 1] }}
          >
            <ul className="flex flex-col gap-1">
              {items.map((l, i) => (
                <m.li
                  key={l.href}
                  initial={{ x: -40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 40, opacity: 0 }}
                  transition={{ delay: 0.15 + 0.08 * i, duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
                >
                  <a
                    ref={i === 0 ? firstLinkRef : undefined}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block py-1 font-display text-[clamp(3.25rem,17vw,5rem)] uppercase leading-[0.95]"
                  >
                    {l.label}
                  </a>
                </m.li>
              ))}
            </ul>
            <m.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.35, duration: 0.4 }}
              onClick={() => setOpen(false)}
            >
              <ButtonLink href={cta} className="w-full">
                Explore the Protocol
              </ButtonLink>
            </m.div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
