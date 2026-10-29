"use client";

import { cubicBezier, m, useMotionValue, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { foldProgress, useViewportSync, viewportW } from "@/lib/fold";
import { lockScroll } from "@/lib/lenis";
import { links, navLinks } from "@/lib/site";
import { useCompact, useHeroPinned } from "@/lib/stage";
import { BrandLockup } from "./BrandMark";

const ease = cubicBezier(0.65, 0, 0.35, 1);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Width of the pill once the fold is done. */
const PILL = 792;
/** Top offset of the pill once the fold is done. */
const PILL_TOP = 12;
/** Gap between the status bar and the nav before the fold. */
const BAR_GAP = 12;

/*
 * Navigation. Compact layout (phones, COMPACT_QUERY): transparent over the hero, then, as the
 * hero folds, a full-width black bar stuck to the top. Static layout (short or reduced motion): a black rounded bar
 * 12px from the top (below the status bar until that scrolls away), with a menu
 * button below 1024px. Pinned layout: 58px tall; over the hero it is 50% glass at
 * the full content width, 48px down; as the hero folds it turns black (fold progress
 * 0 to 0.3), rises to 12px and narrows to the 792px pill with Ondo's three-layer
 * shadow. The fold sets the CSS variables read in globals.css (.nav-bar).
 *
 * There is no per-section tone sampling: the bar is always black or sits over the
 * scrimmed hero, so its text is always white on a dark ground.
 */
export function Nav() {
  const pinned = useHeroPinned();
  const compact = useCompact();
  useViewportSync();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);

  // The status bar sits above the nav and scrolls away: the header follows it up.
  const statusH = useMotionValue(48);
  const { scrollY } = useScroll();
  const scrollTop = useTransform([scrollY, statusH, viewportW], ([y, h, vw]: number[]) =>
    Math.max(vw < 1024 ? 0 : PILL_TOP, h + BAR_GAP - y),
  );

  useEffect(() => {
    const bar = document.getElementById("status-bar");
    if (!bar) return;
    const measure = () => statusH.set(bar.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [statusH]);

  const a = useTransform(foldProgress, (v) => clamp01(v / 0.3));
  const narrow = useTransform(foldProgress, (v) => ease(clamp01((v - 0.3) / 0.7)));
  const width = useTransform([narrow, viewportW], ([t, vw]: number[]) => {
    const full = Math.min(vw - 88, 1512);
    return `${full + (PILL - full) * t}px`;
  });
  const foldTop = useTransform([narrow, statusH], ([t, h]: number[]) => {
    const start = h + BAR_GAP;
    return start + (PILL_TOP - start) * t;
  });

  // Compact (phones): transparent over the hero at first; the fold turns it into a full-width black
  // bar stuck to the very top (square corners, no side gutter).
  const compactTop = useTransform([narrow, statusH], ([t, h]: number[]) => (h + BAR_GAP) * (1 - t));
  const navRadius = useTransform(narrow, (t) => `${12 * (1 - t)}px`);

  const vars = pinned
    ? ({ "--nav-a": a, "--nav-w": width } as unknown as CSSProperties)
    : compact
      ? ({ "--nav-a": a, "--nav-r": navRadius } as unknown as CSSProperties)
      : undefined;

  const close = () => setOpen(false);

  // Escape closes, Tab stays inside the menu, focus returns to the button.
  useEffect(() => {
    lockScroll(open);
    if (open) {
      wasOpen.current = true;
      panelRef.current?.querySelector<HTMLElement>("a")?.focus();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setOpen(false);
          return;
        }
        if (e.key !== "Tab") return;
        // Everything focusable in the header, in DOM order: logo, toggle, then the panel links.
        const focusable = [
          ...(headerRef.current?.querySelectorAll<HTMLElement>("a[href], button") ?? []),
        ].filter((el) => el.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
    if (wasOpen.current) toggleRef.current?.focus();
  }, [open]);

  const items = [
    ...navLinks.map((l) => ({ ...l, external: false })),
    ...(links.docs ? [{ href: links.docs, label: "Docs", external: true }] : []),
  ];
  const ext = (external: boolean) =>
    external ? { target: "_blank", rel: "noopener noreferrer" } : {};

  return (
    <m.header
      ref={headerRef}
      data-surface="dark"
      className="fixed inset-x-0 z-[999] flex justify-center px-[22px] max-lg:!px-0 md:px-[44px]"
      style={{
        top: open ? (compact || viewportW.get() < 1024 ? 0 : PILL_TOP) : pinned ? foldTop : compact ? compactTop : scrollTop,
      }}
    >
      <m.nav
        aria-label="Primary"
        className="nav-bar relative z-[2] flex h-14 max-lg:!w-full max-lg:!rounded-none max-w-[94.5rem] items-center justify-between gap-4 px-3 lg:h-[58px] lg:px-7"
        style={vars}
      >
        <a href="#top" aria-label="Tobin, back to top" className="flex min-h-11 items-center">
          <BrandLockup size={26} />
        </a>

        <ul className="hidden items-center gap-1 lg:flex">
          {items.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="nav-link" {...ext(l.external)}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          {links.github ? (
            <a
              href={links.github}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-light inline-flex !px-3 !py-1.5 !text-[0.8125rem] max-lg:!min-h-8 lg:!px-5 lg:!text-[0.875rem]"
            >
              GitHub
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen((v) => !v)}
            className="t-ui inline-flex min-h-11 min-w-11 items-center gap-3 rounded-btn px-2 lg:hidden"
          >
            <span className="max-sm:sr-only">{open ? "Close" : "Menu"}</span>
            <span className="relative block h-2.5 w-4" aria-hidden="true">
              <span
                className={`absolute left-0 h-[1.5px] w-4 bg-current transition-transform duration-200 ease-out ${open ? "top-[4.25px] rotate-45" : "top-0"}`}
              />
              <span
                className={`absolute left-0 h-[1.5px] w-4 bg-current transition-transform duration-200 ease-out ${open ? "top-[4.25px] -rotate-45" : "top-[8.5px]"}`}
              />
            </span>
          </button>
        </div>
      </m.nav>

      {/* Full-screen black panel (below 1024px). */}
      {open ? (
        <div
          id="site-menu"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="surface-dark fixed inset-0 z-[1] overflow-y-auto px-[22px] pb-10 pt-24 md:px-[44px]"
        >
          <ul>
            {items.map((l) => (
              <li key={l.href} className="rule-top">
                <a
                  href={l.href}
                  onClick={close}
                  className="flex min-h-14 items-center py-3 text-[2.25rem] font-medium leading-none tracking-[-0.03em]"
                  {...ext(l.external)}
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          {links.github ? (
            <a
              href={links.github}
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
              className="btn btn-light mt-8 w-full"
            >
              GitHub
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
        </div>
      ) : null}
    </m.header>
  );
}
