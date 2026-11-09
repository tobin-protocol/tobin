"use client";

import { useId, useSyncExternalStore, type ReactNode } from "react";

const KEY = "tobin-sheet";
let memory = false; // used when sessionStorage is unavailable
const subscribe = (cb: () => void) => { window.addEventListener(KEY, cb); return () => window.removeEventListener(KEY, cb); };
const read = (): boolean => { try { return window.sessionStorage.getItem(KEY) === "open"; } catch { return memory; } };

/**
 * The session action panel. From 768px up it is a normal column (the 420px panel beside the content from 1280px up, stacked above it between 768px and 1279px, where the content needs the width).
 * Under 768px it becomes a sticky bottom sheet above the bottom bar: a collapsed bar that says what the panel is for, and opens to the full panel,
 * which always holds its one primary action or the reason the user cannot act. The open state lasts for the browser tab session only.
 */
export function ActionSheet({ summary, children }: { summary: string; children: ReactNode }) {
  const open = useSyncExternalStore(subscribe, read, () => false);
  const id = useId();
  const toggle = () => {
    const next = !read();
    memory = next;
    try { window.sessionStorage.setItem(KEY, next ? "open" : "closed"); } catch { /* ignore */ }
    window.dispatchEvent(new Event(KEY));
  };
  return (
    <aside
      data-sheet
      aria-label="Session action"
      className="min-w-0 md:order-first xl:order-2 xl:sticky xl:top-24 xl:self-start max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:border-t max-md:border-divider max-md:bg-page"
    >
      <button type="button" onClick={toggle} aria-expanded={open} aria-controls={id} className="flex h-14 w-full items-center justify-between gap-3 px-5 text-left text-body font-medium md:hidden">
        <span className="min-w-0 truncate"><span className="text-label uppercase tracking-wide text-muted">Next step</span><span className="block truncate">{summary}</span></span>
        <span aria-hidden="true" className="shrink-0 text-muted">{open ? "Close" : "Open"}</span>
      </button>
      <div id={id} tabIndex={open ? 0 : undefined} className={open ? "max-md:max-h-[62dvh] max-md:overflow-y-auto max-md:px-2 max-md:pb-3" : "max-md:hidden"}>{children}</div>
    </aside>
  );
}
