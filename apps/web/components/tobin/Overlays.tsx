"use client";

import type { IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";
import { Icon } from "./Icon.tsx";
import { Button } from "@/components/kit/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/kit/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/kit/sheet";

// The last element that had focus outside any dialog. Overlays here are opened from state, not from a trigger, so Radix has nothing to return focus to;
// this is what it gets back. Tracked with one document listener, so there is no read of a ref while rendering.
let lastOutside: HTMLElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener("focusin", (e) => { const t = e.target; if (t instanceof HTMLElement && !t.closest("[role=dialog]")) lastOutside = t; });
}

/** Gives focus back to the element that opened the overlay when it closes, so keyboard and screen-reader users land where they were. */
export function useReturnFocus(open: boolean): (e: Event) => void {
  void open;
  return (e: Event) => { const el = lastOutside; if (el?.isConnected) { e.preventDefault(); el.focus(); } };
}

/**
 * One confirmation: a shadcn Dialog (focus trapped, focus returned, Escape closes) with a primary button labelled with the action, never "OK". A drop-in for the
 * older native-dialog `Dialog`: same props. `children` sit in a #f0f0f0 summary block.
 */
export function Confirm({ open, onClose, title, description, children, primary, secondaryLabel = "Cancel", destructive = false }: {
  open: boolean; onClose: () => void; title: string; description?: ReactNode; children?: ReactNode;
  primary: { label: string; onClick: () => void; loading?: boolean; disabled?: boolean };
  secondaryLabel?: string; destructive?: boolean;
}) {
  const back = useReturnFocus(open);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto" onCloseAutoFocus={back}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild><div className="text-body text-muted">{description}</div></DialogDescription>
        </DialogHeader>
        {children ? <div className="bg-tile p-4 text-body">{children}</div> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{secondaryLabel}</Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={primary.onClick} disabled={primary.disabled || primary.loading}>{primary.loading ? "Working" : primary.label}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A right-hand detail panel for one record, without leaving the list: a shadcn Sheet, full width on small screens. Drop-in for the older `SidePanel`. */
export function DetailSheet({ open, onClose, title, icon, children }: { open: boolean; onClose: () => void; title: string; /** a Hugeicons icon shown before the title */ icon?: IconSvgElement; children: ReactNode }) {
  const back = useReturnFocus(open);
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-[480px] overflow-y-auto sm:max-w-[480px]" onCloseAutoFocus={back}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">{icon ? <Icon icon={icon} size={20} /> : null}{title}</SheetTitle>
          <SheetDescription className="sr-only">Details of the selected record. Read-only unless an action is shown.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
