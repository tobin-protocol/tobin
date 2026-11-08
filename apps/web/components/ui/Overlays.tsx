"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/format.ts";
import { Button } from "./Button.tsx";

function useModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const handler = () => onClose();
    d.addEventListener("close", handler);
    return () => d.removeEventListener("close", handler);
  }, [onClose]);
  return ref;
}

/** 24px radius, one soft shadow, a summary card inside, and a primary button labelled with the action ("Reject operation", never "OK"). */
export function Dialog({ open, onClose, title, description, children, primary, secondaryLabel = "Cancel", destructive = false }: {
  open: boolean; onClose: () => void; title: string; description?: ReactNode; children?: ReactNode;
  primary: { label: string; onClick: () => void; loading?: boolean; disabled?: boolean };
  secondaryLabel?: string; destructive?: boolean;
}) {
  const ref = useModal(open, onClose);
  const titleId = useId();
  return (
    <dialog ref={ref} aria-labelledby={titleId} className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-panel bg-card p-0 shadow-float backdrop:bg-scrim">
      <div className="p-6">
        <h2 id={titleId} className="text-entity font-medium">{title}</h2>
        {description ? <p className="mt-2 text-body text-muted">{description}</p> : null}
        {children ? <div className="mt-4 rounded-card bg-panel p-4 text-body">{children}</div> : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="quiet" onClick={onClose}>{secondaryLabel}</Button>
          <Button variant={destructive ? "destructive" : "primary"} onClick={primary.onClick} loading={primary.loading} disabled={primary.disabled}>{primary.label}</Button>
        </div>
      </div>
    </dialog>
  );
}

/** A 480px right drawer on #f0f0f0 for record detail without leaving the list. Full width on small screens. */
export function SidePanel({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useModal(open, onClose);
  const titleId = useId();
  return (
    <dialog ref={ref} aria-labelledby={titleId} className="m-0 ml-auto h-dvh max-h-none w-full max-w-[480px] rounded-l-panel bg-panel p-0 shadow-float backdrop:bg-scrim">
      <div className="flex h-full flex-col p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-entity font-medium">{title}</h2>
          <Button variant="quiet" onClick={onClose} aria-label="Close panel">Close</Button>
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}

/** A small popover for menus: closes on Escape and on an outside click; the trigger gets focus back. */
export function Popover({ trigger, children, align = "left", panelClassName }: {
  trigger: (props: { open: boolean; toggle: () => void; ref: React.RefObject<HTMLButtonElement | null>; id: string }) => ReactNode;
  children: (close: () => void) => ReactNode; align?: "left" | "right"; panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={root} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o), ref: btn, id })}
      {open ? (
        <div id={id} className={cn("absolute top-full z-30 mt-2 min-w-64 rounded-panel bg-card p-2 shadow-float", align === "right" ? "right-0" : "left-0", panelClassName)}>
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export interface Command { id: string; label: string; group: string; onSelect: () => void }
/** The Cmd+K command panel. It lists destinations (real). Record search is NOT supported by the backend and the panel says so. */
export function CommandPanel({ open, onClose, commands, notice }: { open: boolean; onClose: () => void; commands: Command[]; notice: ReactNode }) {
  const [q, setQ] = useState("");
  const closeAndReset = () => { setQ(""); onClose(); };
  const ref = useModal(open, closeAndReset);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 0); }, [open]);
  const shown = commands.filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase()));
  const groups = [...new Set(shown.map((c) => c.group))];
  return (
    <dialog ref={ref} aria-label="Command panel" className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl rounded-panel bg-card p-0 shadow-float backdrop:bg-scrim">
      <div className="p-4">
        <label htmlFor="cmd-input" className="sr-only">Go to</label>
        <input ref={input} id="cmd-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Go to a page" className="w-full rounded-btn border border-field bg-card px-3 py-2.5 text-action font-medium outline-none placeholder:text-disabled focus:outline-2 focus:outline-offset-2 focus:outline-button" />
        <div className="mt-3 max-h-72 overflow-y-auto">
          {groups.length === 0 ? <p className="px-2 py-3 text-body text-muted">No pages match.</p> : groups.map((g) => (
            <div key={g} className="mb-2">
              <p className="px-2 pb-1 text-label uppercase tracking-wide text-muted">{g}</p>
              <ul>{shown.filter((c) => c.group === g).map((c) => (
                <li key={c.id}><button type="button" onClick={() => { c.onSelect(); closeAndReset(); }} className="flex h-10 w-full items-center rounded-btn px-2 text-left text-body font-medium hover:bg-ink-5">{c.label}</button></li>
              ))}</ul>
            </div>
          ))}
        </div>
        <div className="mt-2 rounded-card bg-panel p-3 text-body text-muted" role="note">{notice}</div>
      </div>
    </dialog>
  );
}
